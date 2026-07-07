// Diagnostic endpoint — counts records in Dataverse to determine real salon count.
// GET /api/debug/counts
// NOT for production use. Remove once counts are confirmed.

import { NextResponse } from "next/server"
import { dvFetch } from "@/lib/dataverse-client"

export const maxDuration = 60

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Total dom_rewardpointsheader records (with distributor filter)
  const countXml = `<fetch aggregate="true" no-lock="true">
  <entity name="dom_rewardpointsheader">
    <attribute name="dom_rewardpointsheaderid" aggregate="count" alias="total"/>
    <filter type="or">
      <condition attribute="dom_acctnumber" operator="begins-with" value="EVO-"/>
      <condition attribute="dom_acctnumber" operator="begins-with" value="UBE-"/>
      <condition attribute="dom_acctnumber" operator="begins-with" value="SSG-"/>
      <condition attribute="dom_acctnumber" operator="begins-with" value="INT-"/>
      <condition attribute="dom_acctnumber" operator="begins-with" value="WES-"/>
      <condition attribute="dom_acctnumber" operator="begins-with" value="SSP-"/>
    </filter>
  </entity>
</fetch>`

  const r1 = await dvFetch(`/dom_rewardpointsheaders?fetchXml=${encodeURIComponent(countXml)}`)
  const d1 = await r1.json()
  results.totalHeaderRecordsWithFilter = d1?.value?.[0]?.total ?? d1

  // 2. Total without any filter (all dom_rewardpointsheader records)
  const countAllXml = `<fetch aggregate="true" no-lock="true">
  <entity name="dom_rewardpointsheader">
    <attribute name="dom_rewardpointsheaderid" aggregate="count" alias="total"/>
  </entity>
</fetch>`

  const r2 = await dvFetch(`/dom_rewardpointsheaders?fetchXml=${encodeURIComponent(countAllXml)}`)
  const d2 = await r2.json()
  results.totalHeaderRecordsNoFilter = d2?.value?.[0]?.total ?? d2

  // 3. Contact + link-entity approach — count pages and total rows
  const contactLinkXml = (page: number, cookie?: string) => {
    const cookieAttr = cookie
      ? ` paging-cookie="${cookie.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
      : ""
    return `<fetch distinct="true" page="${page}" count="5000"${cookieAttr} no-lock="true">
  <entity name="contact">
    <attribute name="contactid"/>
    <link-entity name="dom_rewardpointsheader" from="dom_distributorsalon" to="contactid" link-type="inner" alias="h">
      <attribute name="dom_acctnumber"/>
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

  let totalRows = 0
  let pages = 0
  let clCookie: string | undefined
  const uniqueIds = new Set<string>()
  for (;;) {
    const xml = contactLinkXml(pages + 1, clCookie)
    const r = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)
    const d = await r.json()
    const rows = d?.value ?? []
    totalRows += rows.length
    pages++
    for (const row of rows) {
      if (row.contactid) uniqueIds.add(row.contactid as string)
    }
    const more = d?.["@Microsoft.Dynamics.CRM.morerecords"] === true
    const rawCookie = d?.["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] as string | undefined
    clCookie = rawCookie ? decodeURIComponent(rawCookie) : undefined
    if (!more || rows.length === 0) break
  }
  results.contactLinkEntityPagination = {
    totalRows,
    uniqueContactIds: uniqueIds.size,
    pages,
  }

  // 4. Total contacts (no filter) — how many contacts exist at all
  const contactCountXml = `<fetch aggregate="true" no-lock="true">
  <entity name="contact">
    <attribute name="contactid" aggregate="count" alias="total"/>
  </entity>
</fetch>`

  const r4 = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(contactCountXml)}`)
  const d4 = await r4.json()
  results.totalContacts = d4?.value?.[0]?.total ?? d4

  return NextResponse.json(results, { status: 200 })
}
