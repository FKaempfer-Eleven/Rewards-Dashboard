// In-memory cache of all salon aggregate data from Dataverse.
// Fetched once per server instance (or when TTL expires), then filtered/sorted
// per-request in the API route — so filtering is instant after the first load.

import { dvFetch } from "./dataverse-client"
import { mapRowToLiveSalon, type LiveSalon } from "./live-salon"

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  salons: LiveSalon[]
  timestamp: number
}

let _cache: CacheEntry | null = null

// ── FetchXML builder ──────────────────────────────────────────────────────────

function buildFetchXml(page: number, cookie?: string): string {
  // Escape the cookie value for use in XML attribute
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
      <attribute name="dom_monthlysalontotalsales" aggregate="sum" alias="lifetimeSales"/>
      <attribute name="dom_monthlysaloncarepoints" aggregate="sum" alias="carePts"/>
      <attribute name="dom_monthlysaloncolorpoints" aggregate="sum" alias="colorPts"/>
      <attribute name="dom_monthlysalontotalpoints_redeemed" aggregate="sum" alias="redeemed"/>
      <attribute name="dom_monthlysalontotalpointsremaining" aggregate="sum" alias="pointsBalance"/>
      <attribute name="dom_rewardpointsheaderid" aggregate="count" alias="monthCount"/>
      <attribute name="dom_salonsalesfrom" aggregate="max" alias="lastPurchase"/>
      <attribute name="dom_acctnumber" aggregate="max" alias="acctnumber"/>
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

  return all
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns all salons, using the in-memory cache when fresh. */
export async function getAllSalons(): Promise<LiveSalon[]> {
  if (_cache && Date.now() - _cache.timestamp < CACHE_TTL) {
    return _cache.salons
  }

  const salons = await fetchAllFromDataverse()
  _cache = { salons, timestamp: Date.now() }
  return salons
}

/** Force-refresh the cache (e.g. after an upload). */
export function invalidateSalonCache(): void {
  _cache = null
}
