// Salon aggregate cache backed by Next.js Data Cache (unstable_cache).
// On Vercel, this persists across serverless invocations — unlike a plain
// module-level variable which resets on every cold start.
//
// Cache TTL: 1 hour.  Tag: "salons" — call revalidateTag("salons") from a
// Server Action or Route Handler to force an early refresh (e.g. after upload).

import { unstable_cache } from "next/cache"
import { dvFetch } from "./dataverse-client"
import { mapRowToLiveSalon, type LiveSalon } from "./live-salon"

export const SALON_CACHE_TAG = "salons"

// ── FetchXML builder ──────────────────────────────────────────────────────────

function buildFetchXml(page: number, cookie?: string): string {
  const cookieAttr = cookie
    ? ` paging-cookie="${cookie.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
    : ""

  // dom_acctnumber is nvarchar — MAX not supported; use groupby instead.
  // createdon is a system DateTime field that supports MAX aggregate.
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

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchAllFromDataverse(): Promise<LiveSalon[]> {
  const all: LiveSalon[] = []
  let page = 1
  let cookie: string | undefined

  for (;;) {
    const xml = buildFetchXml(page, cookie)
    const res = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)

    if (!res.ok) {
      throw new Error(`Salon cache fetch failed (page ${page}): ${await res.text()}`)
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

  // Deduplicate: a salon that switched distributors produces one row per acctnumber.
  // Merge rows with the same contactid, summing financials and keeping the most
  // recent acctnumber (highest lastPurchase).
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all salons from Next.js Data Cache (Vercel-persisted, 1-hour TTL).
 * On cache miss this fetches ~5k records from Dataverse (~10-15s).
 * On cache hit this returns instantly from Vercel's CDN data layer.
 */
export const getAllSalons = unstable_cache(
  fetchAllFromDataverse,
  ["salon-aggregate-data"],
  { revalidate: 3600, tags: [SALON_CACHE_TAG] }
)
