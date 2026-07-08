// Salon data backed by Supabase — fast reads (~5ms), no Dataverse on the hot path.
//
// Data flow:
//   Dataverse ──[daily cron]──▶ /api/sync ──▶ Supabase salon_cache
//   API routes ──────────────▶ getAllSalons() ──▶ Supabase (instant)
//
// unstable_cache wraps the Supabase read to reduce DB calls under load (5-min TTL).
// Call revalidateTag(SALON_CACHE_TAG, "default") after a sync to flush immediately.

import { unstable_cache } from "next/cache"
import { dvFetch } from "./dataverse-client"
import {
  mapRowToLiveSalon,
  isSalonActive,
  parseSalonFullname,
  distributorCodeFromAcct,
  distributorIdxFromCode,
  type LiveSalon,
} from "./live-salon"

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
 * Flush immediately via revalidateTag(SALON_CACHE_TAG, "default").
 */
export const getAllSalons = unstable_cache(
  fetchSalonsFromSupabase,
  ["salon-aggregate-data"],
  { revalidate: 300, tags: [SALON_CACHE_TAG] }
)

// ── Dataverse fetchers (used by /api/sync only) ───────────────────────────────

const DISTRIBUTOR_FILTER = `
      <filter type="or">
        <condition attribute="dom_acctnumber" operator="begins-with" value="EVO-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="UBE-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSG-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="INT-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="WES-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSP-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="PRE-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="TOR-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="LIQ-"/>
      </filter>`

// ── Phase 1: collect all contactids via dom_rewardpointsheader (non-distinct) ─
//
// Why NOT query contact+link-entity with distinct="true":
//   • Dataverse does not return link-entity attribute values when distinct is set,
//     so h_dom_acctnumber is always null.
//   • The distinct+link-entity combination may mis-paginate, capping at page-1 (5 000 rows).
// Correct approach: page through all header rows without distinct and deduplicate
// contactids in code.  30 232 rows ÷ 5 000 per page = 7 pages — fast and correct.

function buildDistributorIdsFetchXml(page: number, cookie?: string): string {
  const cookieAttr = cookie
    ? ` paging-cookie="${cookie.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
    : ""
  return `<fetch page="${page}" count="5000"${cookieAttr} no-lock="true">
  <entity name="dom_rewardpointsheader">
    <attribute name="dom_distributorsalon"/>
    ${DISTRIBUTOR_FILTER}
  </entity>
</fetch>`
}

async function fetchAllDistributorContactIds(): Promise<{
  ids: string[]
  pages: number
  headerRows: number
}> {
  const ids = new Set<string>()
  let page = 1
  let cookie: string | undefined
  let headerRows = 0

  for (;;) {
    const xml = buildDistributorIdsFetchXml(page, cookie)
    const res = await dvFetch(`/dom_rewardpointsheaders?fetchXml=${encodeURIComponent(xml)}`)
    if (!res.ok) throw new Error(`Contact ID fetch failed (page ${page}): ${await res.text()}`)

    const data = (await res.json()) as {
      value: Record<string, unknown>[]
      "@Microsoft.Dynamics.CRM.morerecords"?: boolean
      "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string
    }

    for (const row of data.value ?? []) {
      // dom_distributorsalon is a lookup — FetchXML returns the GUID directly
      const id = (row["dom_distributorsalon"] as string | undefined)?.trim()
      if (id) ids.add(id)
    }

    headerRows += (data.value ?? []).length
    const hasMore = data["@Microsoft.Dynamics.CRM.morerecords"] === true
    const rawCookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] as string | undefined
    cookie = rawCookie ? decodeURIComponent(rawCookie) : undefined

    if (!hasMore || (data.value ?? []).length === 0) break
    page++
  }

  return { ids: Array.from(ids), pages: page, headerRows }
}

// ── Phase 2: aggregate contact metadata + acctnumber + financials ─────────────
//
// One aggregate query per batch of 200 contactids.
// Groups by (contactid, contact fields, acctnumber) so a salon that has records
// from two distributors (e.g. EVO- and SSP-) produces two rows — dedup below
// keeps the most recent acctnumber and sums the financials.
//
// This same function is also used by /api/sync for delta syncs.

export function buildByIdsFetchXml(ids: string[]): string {
  const inValues = ids.map((id) => `<value>${id}</value>`).join("\n        ")
  return `<fetch aggregate="true" no-lock="true">
  <entity name="contact">
    <attribute name="contactid" groupby="true" alias="id"/>
    <attribute name="fullname" groupby="true" alias="rawName"/>
    <attribute name="emailaddress1" groupby="true" alias="email"/>
    <attribute name="address1_city" groupby="true" alias="city"/>
    <attribute name="address1_stateorprovince" groupby="true" alias="state"/>
    <attribute name="address1_postalcode" groupby="true" alias="zip"/>
    <attribute name="address1_country" groupby="true" alias="country"/>
    <filter>
      <condition attribute="contactid" operator="in">
        ${inValues}
      </condition>
    </filter>
    <link-entity name="dom_rewardpointsheader" from="dom_distributorsalon" to="contactid" link-type="inner" alias="h">
      <attribute name="dom_acctnumber" groupby="true" alias="acctnumber"/>
      <attribute name="dom_monthlysalontotalsales" aggregate="sum" alias="lifetimeSales"/>
      <attribute name="dom_monthlysaloncarepoints" aggregate="sum" alias="carePts"/>
      <attribute name="dom_monthlysaloncolorpoints" aggregate="sum" alias="colorPts"/>
      <attribute name="dom_monthlysalontotalpoints_redeemed" aggregate="sum" alias="redeemed"/>
      <attribute name="dom_monthlysalontotalpointsremaining" aggregate="sum" alias="pointsBalance"/>
      <attribute name="dom_rewardpointsheaderid" aggregate="count" alias="monthCount"/>
      <attribute name="createdon" aggregate="max" alias="lastPurchase"/>
      ${DISTRIBUTOR_FILTER}
    </link-entity>
  </entity>
</fetch>`
}

/**
 * Fetches and deduplicates salon data for a given list of contactids.
 * Salons with records under multiple distributor accounts get their financials
 * summed and the most-recent acctnumber kept.
 *
 * Used by both full sync and delta sync.
 */
export async function fetchSalonsByIds(ids: string[]): Promise<LiveSalon[]> {
  if (ids.length === 0) return []

  const BATCH = 200
  const all: LiveSalon[] = []

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const xml = buildByIdsFetchXml(batch)
    const res = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)
    if (!res.ok) throw new Error(`Salon batch failed (offset ${i}): ${await res.text()}`)
    const data = (await res.json()) as { value: Record<string, unknown>[] }
    for (const row of data.value ?? []) {
      all.push(mapRowToLiveSalon(row))
    }
  }

  // Deduplicate: same contactid with multiple acctnumbers → sum financials, keep latest acct
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
        avgMonthlySales: 0, // recalculated below
      })
    }
  }

  return Array.from(byId.values()).map((s) => ({
    ...s,
    avgMonthlySales: s.monthCount > 0 ? s.lifetimeSales / s.monthCount : 0,
  }))
}

/**
 * Fetches ALL enrolled salons from Dataverse in two phases.
 *
 * Phase 1: page through dom_rewardpointsheader (non-distinct) to collect every
 *          contactid that has at least one header record with a valid distributor
 *          prefix.  ~30 000 rows → 7 pages → deduplicated to ~7 000 unique IDs.
 *
 * Phase 2: aggregate query (batches of 200) to get contact metadata + acctnumber
 *          + lifetime financials for those IDs.
 */
export async function fetchAllFromDataverse(): Promise<{
  salons: LiveSalon[]
  phase1Pages: number
  phase1HeaderRows: number
  phase1UniqueIds: number
  phase2Batches: number
}> {
  // Phase 1
  const { ids: allIds, pages: phase1Pages, headerRows: phase1HeaderRows } =
    await fetchAllDistributorContactIds()
  const phase1UniqueIds = allIds.length

  // Phase 2
  const BATCH = 200
  let phase2Batches = 0
  const all: LiveSalon[] = []

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH)
    const xml = buildByIdsFetchXml(batch)
    const res = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)
    if (!res.ok) throw new Error(`Aggregate batch failed (offset ${i}): ${await res.text()}`)
    const data = (await res.json()) as { value: Record<string, unknown>[] }
    for (const row of data.value ?? []) {
      all.push(mapRowToLiveSalon(row))
    }
    phase2Batches++
  }

  // Deduplicate (contacts with 2+ distributor accounts)
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

  const salons = Array.from(byId.values()).map((s) => ({
    ...s,
    avgMonthlySales: s.monthCount > 0 ? s.lifetimeSales / s.monthCount : 0,
  }))

  return { salons, phase1Pages, phase1HeaderRows, phase1UniqueIds, phase2Batches }
}
