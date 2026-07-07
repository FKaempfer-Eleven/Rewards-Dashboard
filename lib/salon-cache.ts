// Salon data backed by Supabase — fast reads (~5ms), no Dataverse on the hot path.
//
// Data flow:
//   Dataverse ──[daily cron]──▶ /api/sync ──▶ Supabase salon_cache
//   API routes ──────────────▶ getAllSalons() ──▶ Supabase (instant)
//
// unstable_cache wraps the Supabase read to reduce DB calls under load (5-min TTL).
// Call revalidateTag(SALON_CACHE_TAG) after a sync to flush immediately.

import { unstable_cache } from "next/cache"
import { dvFetch } from "./dataverse-client"
import { mapRowToLiveSalon, isSalonActive, type LiveSalon } from "./live-salon"

export const SALON_CACHE_TAG = "salons"

// ── Supabase row → LiveSalon ──────────────────────────────────────────────────

export function mapSupabaseRow(row: Record<string, unknown>): LiveSalon {
  const lastPurchase = row.last_purchase
    ? new Date(row.last_purchase as string).toISOString()
    : null
  return {
    id: row.id as string,
    rawName: (row.raw_name as string) ?? "",
    salonName: (row.salon_name as string) ?? "",
    contactName: (row.contact_name as string) ?? "",
    email: (row.email as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    zip: (row.zip as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    acctnumber: (row.acct_number as string | null) ?? null,
    distributorCode: (row.distributor_code as string | null) ?? null,
    distributorIdx: Number(row.distributor_idx ?? -1),
    lifetimeSales: Number(row.lifetime_sales ?? 0),
    lifetimePointsIssued: Number(row.lifetime_points_issued ?? 0),
    lifetimePointsRedeemed: Number(row.lifetime_points_redeemed ?? 0),
    pointsBalance: Number(row.points_balance ?? 0),
    monthCount: Number(row.month_count ?? 0),
    lastPurchase,
    isActive: Boolean(row.is_active),
    avgMonthlySales: Number(row.avg_monthly_sales ?? 0),
  }
}

// ── Supabase reader ───────────────────────────────────────────────────────────

async function fetchSalonsFromSupabase(): Promise<LiveSalon[]> {
  // Lazy-import to avoid initialisation errors when env vars not set at build time
  const { supabase } = await import("./supabase-client")

  const { data, error } = await supabase
    .from("salon_cache")
    .select("*")
    .order("lifetime_sales", { ascending: false })

  if (error) throw new Error(`Supabase read failed: ${error.message}`)
  return (data ?? []).map(mapSupabaseRow)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all salons from Supabase (pre-synced from Dataverse).
 * Reads are cached for 5 minutes in Vercel's Data Cache.
 * Flush immediately via revalidateTag(SALON_CACHE_TAG).
 */
export const getAllSalons = unstable_cache(
  fetchSalonsFromSupabase,
  ["salon-aggregate-data"],
  { revalidate: 300, tags: [SALON_CACHE_TAG] }
)

// ── Dataverse fetcher (used by /api/sync only) ────────────────────────────────

function buildFullFetchXml(page: number, cookie?: string): string {
  const cookieAttr = cookie
    ? ` paging-cookie="${cookie.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
    : ""

  return `<fetch aggregate="true" page="${page}" count="5000"${cookieAttr} no-lock="true">
  <entity name="contact">
    <attribute name="contactid" groupby="true" alias="id"/>
    <attribute name="fullname" groupby="true" alias="rawName"/>
    <attribute name="emailaddress1" groupby="true" alias="email"/>
    <attribute name="address1_city" groupby="true" alias="city"/>
    <attribute name="address1_stateorprovince" groupby="true" alias="state"/>
    <attribute name="address1_postalcode" groupby="true" alias="zip"/>
    <attribute name="address1_country" groupby="true" alias="country"/>
    <link-entity name="dom_rewardpointsheader" from="dom_distributorsalon" to="contactid" link-type="inner" alias="h">
      <attribute name="dom_acctnumber" groupby="true" alias="acctnumber"/>
      <attribute name="dom_monthlysalontotalsales" aggregate="sum" alias="lifetimeSales"/>
      <attribute name="dom_monthlysaloncarepoints" aggregate="sum" alias="carePts"/>
      <attribute name="dom_monthlysaloncolorpoints" aggregate="sum" alias="colorPts"/>
      <attribute name="dom_monthlysalontotalpoints_redeemed" aggregate="sum" alias="redeemed"/>
      <attribute name="dom_monthlysalontotalpointsremaining" aggregate="sum" alias="pointsBalance"/>
      <attribute name="dom_rewardpointsheaderid" aggregate="count" alias="monthCount"/>
      <attribute name="createdon" aggregate="max" alias="lastPurchase"/>
      <filter type="or">
        <condition attribute="dom_acctnumber" operator="begins-with" value="EVO-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="UBE-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSG-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="INT-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="WES-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSP-"/>
      </filter>
    </link-entity>
  </entity>
</fetch>`
}

/**
 * Fetches ALL salons from Dataverse via aggregate FetchXML.
 * Used by /api/sync for the initial full population.
 * WARNING: Takes 60+ seconds on Vercel — run locally or via a long-running job.
 */
export async function fetchAllFromDataverse(): Promise<LiveSalon[]> {
  const all: LiveSalon[] = []
  let page = 1
  let cookie: string | undefined

  for (;;) {
    const xml = buildFullFetchXml(page, cookie)
    const res = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)

    if (!res.ok) {
      throw new Error(`Dataverse fetch failed (page ${page}): ${await res.text()}`)
    }

    const data = (await res.json()) as {
      value: Record<string, unknown>[]
      "@Microsoft.Dynamics.CRM.morerecords"?: boolean
      "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string
    }

    for (const row of data.value ?? []) {
      all.push(mapRowToLiveSalon(row))
    }

    const hasMore = data["@Microsoft.Dynamics.CRM.morerecords"] === true
    cookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"]

    if (!hasMore || (data.value ?? []).length === 0) break
    page++
  }

  // Deduplicate: salons that switched distributors produce one row per acctnumber.
  const byId = new Map<string, LiveSalon>()
  for (const s of all) {
    const existing = byId.get(s.id)
    if (!existing) {
      byId.set(s.id, s)
    } else {
      const useNew = (s.lastPurchase ?? "") > (existing.lastPurchase ?? "")
      byId.set(s.id, {
        ...existing,
        acctnumber: useNew ? s.acctnumber : existing.acctnumber,
        distributorCode: useNew ? s.distributorCode : existing.distributorCode,
        distributorIdx: useNew ? s.distributorIdx : existing.distributorIdx,
        lifetimeSales: existing.lifetimeSales + s.lifetimeSales,
        lifetimePointsIssued: existing.lifetimePointsIssued + s.lifetimePointsIssued,
        lifetimePointsRedeemed: existing.lifetimePointsRedeemed + s.lifetimePointsRedeemed,
        pointsBalance: existing.pointsBalance + s.pointsBalance,
        monthCount: existing.monthCount + s.monthCount,
        lastPurchase: useNew ? s.lastPurchase : existing.lastPurchase,
        isActive: existing.isActive || s.isActive,
        avgMonthlySales: 0,
      })
    }
  }

  return Array.from(byId.values()).map((s) => ({
    ...s,
    avgMonthlySales: s.monthCount > 0 ? s.lifetimeSales / s.monthCount : 0,
  }))
}
