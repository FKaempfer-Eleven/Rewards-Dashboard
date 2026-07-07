// Sync endpoint — keeps Supabase salon_cache in sync with Dataverse.
//
// GET /api/sync            → delta sync (new records since last sync, fast ~1-5s)
// GET /api/sync?mode=full  → full sync (all 5k+ salons, run locally — Vercel times out)
// GET /api/sync?mode=reconcile → weekly deletion check
//
// Protected by CRON_SECRET env var. Vercel cron sends it as a header automatically.
// Manual calls: /api/sync?secret=<CRON_SECRET>

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { dvFetch } from "@/lib/dataverse-client"
import { mapRowToLiveSalon, type LiveSalon } from "@/lib/live-salon"
import { SALON_CACHE_TAG, fetchAllFromDataverse, mapSupabaseRow } from "@/lib/salon-cache"

export const maxDuration = 60

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // no secret set — allow (dev mode)
  // Vercel cron sends Authorization: Bearer <secret>
  const header = req.headers.get("authorization")?.replace("Bearer ", "")
  const query = req.nextUrl.searchParams.get("secret")
  return header === cronSecret || query === cronSecret
}

// ── FetchXML for delta: changed contact IDs ───────────────────────────────────

function buildChangedIdsFetchXml(since: string, page: number, cookie?: string): string {
  const cookieAttr = cookie
    ? ` paging-cookie="${cookie.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
    : ""
  // ISO → Dataverse datetime format (drop milliseconds)
  const sinceStr = since.replace(/\.\d{3}Z$/, "Z")

  return `<fetch distinct="true" page="${page}" count="5000"${cookieAttr} no-lock="true">
  <entity name="dom_rewardpointsheader">
    <attribute name="dom_distributorsalon"/>
    <filter type="and">
      <condition attribute="createdon" operator="gt" value="${sinceStr}"/>
      <filter type="or">
        <condition attribute="dom_acctnumber" operator="begins-with" value="EVO-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="UBE-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSG-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="INT-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="WES-"/>
        <condition attribute="dom_acctnumber" operator="begins-with" value="SSP-"/>
      </filter>
    </filter>
  </entity>
</fetch>`
}

// ── FetchXML for aggregate data of specific contact IDs ───────────────────────

function buildByIdsFetchXml(ids: string[]): string {
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

// ── Dataverse helpers ─────────────────────────────────────────────────────────

async function fetchChangedContactIds(since: string): Promise<string[]> {
  const ids = new Set<string>()
  let page = 1
  let cookie: string | undefined

  for (;;) {
    const xml = buildChangedIdsFetchXml(since, page, cookie)
    const res = await dvFetch(
      `/dom_rewardpointsheaders?fetchXml=${encodeURIComponent(xml)}`
    )
    if (!res.ok) throw new Error(`Delta IDs fetch failed: ${await res.text()}`)

    const data = (await res.json()) as {
      value: Record<string, unknown>[]
      "@Microsoft.Dynamics.CRM.morerecords"?: boolean
      "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string
    }

    for (const row of data.value ?? []) {
      const id = row["dom_distributorsalon"] as string | undefined
      if (id) ids.add(id)
    }

    if (!data["@Microsoft.Dynamics.CRM.morerecords"] || (data.value ?? []).length === 0) break
    cookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"]
    page++
  }

  return Array.from(ids)
}

async function fetchSalonsByIds(ids: string[]): Promise<LiveSalon[]> {
  if (ids.length === 0) return []

  // Batch into chunks of 200 to keep FetchXML manageable
  const CHUNK = 200
  const all: LiveSalon[] = []

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const xml = buildByIdsFetchXml(chunk)
    const res = await dvFetch(`/contacts?fetchXml=${encodeURIComponent(xml)}`)
    if (!res.ok) throw new Error(`Salon by-IDs fetch failed: ${await res.text()}`)
    const data = (await res.json()) as { value: Record<string, unknown>[] }
    for (const row of data.value ?? []) {
      all.push(mapRowToLiveSalon(row))
    }
  }

  // Deduplicate (same logic as fetchAllFromDataverse)
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

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function upsertSalons(salons: LiveSalon[]) {
  const { supabase } = await import("@/lib/supabase-client")
  const rows = salons.map((s) => ({
    id: s.id,
    raw_name: s.rawName,
    salon_name: s.salonName,
    contact_name: s.contactName,
    email: s.email,
    city: s.city,
    state: s.state,
    zip: s.zip,
    country: s.country,
    acct_number: s.acctnumber,
    distributor_code: s.distributorCode,
    distributor_idx: s.distributorIdx,
    lifetime_sales: s.lifetimeSales,
    lifetime_points_issued: s.lifetimePointsIssued,
    lifetime_points_redeemed: s.lifetimePointsRedeemed,
    points_balance: s.pointsBalance,
    month_count: s.monthCount,
    last_purchase: s.lastPurchase,
    is_active: s.isActive,
    avg_monthly_sales: s.avgMonthlySales,
    synced_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from("salon_cache")
    .upsert(rows, { onConflict: "id" })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
}

async function getLastSync(): Promise<string> {
  const { supabase } = await import("@/lib/supabase-client")
  const { data } = await supabase
    .from("salon_sync_meta")
    .select("last_delta_sync, last_full_sync")
    .eq("id", 1)
    .single()

  // Fall back to 7 days ago if no sync has ever run
  const ts = data?.last_delta_sync ?? data?.last_full_sync
  if (ts) return ts
  const fallback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return fallback.toISOString()
}

async function updateSyncMeta(patch: {
  lastDeltaSync?: string
  lastFullSync?: string
  salonCount?: number
}) {
  const { supabase } = await import("@/lib/supabase-client")
  const update: Record<string, unknown> = {}
  if (patch.lastDeltaSync) update.last_delta_sync = patch.lastDeltaSync
  if (patch.lastFullSync) update.last_full_sync = patch.lastFullSync
  if (patch.salonCount !== undefined) update.salon_count = patch.salonCount
  await supabase.from("salon_sync_meta").update(update).eq("id", 1)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "delta"
  const start = Date.now()

  try {
    // ── Full sync ─────────────────────────────────────────────────────────────
    if (mode === "full") {
      const salons = await fetchAllFromDataverse()
      await upsertSalons(salons)
      await updateSyncMeta({
        lastFullSync: new Date().toISOString(),
        lastDeltaSync: new Date().toISOString(),
        salonCount: salons.length,
      })
      revalidateTag(SALON_CACHE_TAG)
      return NextResponse.json({
        ok: true,
        mode: "full",
        count: salons.length,
        ms: Date.now() - start,
      })
    }

    // ── Reconcile: find & remove deleted salons ───────────────────────────────
    if (mode === "reconcile") {
      const { supabase } = await import("@/lib/supabase-client")

      // Get all IDs from Supabase
      const { data: cached } = await supabase.from("salon_cache").select("id")
      const cachedIds = new Set((cached ?? []).map((r) => r.id as string))

      // Get all active contact IDs from Dataverse (lightweight — just IDs)
      const xml = `<fetch distinct="true" no-lock="true">
  <entity name="dom_rewardpointsheader">
    <attribute name="dom_distributorsalon"/>
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
      const res = await dvFetch(`/dom_rewardpointsheaders?fetchXml=${encodeURIComponent(xml)}`)
      const data = (await res.json()) as { value: Record<string, unknown>[] }
      const activeIds = new Set(
        (data.value ?? []).map((r) => r["dom_distributorsalon"] as string).filter(Boolean)
      )

      const toDelete = [...cachedIds].filter((id) => !activeIds.has(id))
      if (toDelete.length > 0) {
        await supabase.from("salon_cache").delete().in("id", toDelete)
      }

      return NextResponse.json({
        ok: true,
        mode: "reconcile",
        deleted: toDelete.length,
        ms: Date.now() - start,
      })
    }

    // ── Delta sync (default) ──────────────────────────────────────────────────
    const lastSync = await getLastSync()
    const changedIds = await fetchChangedContactIds(lastSync)

    if (changedIds.length === 0) {
      await updateSyncMeta({ lastDeltaSync: new Date().toISOString() })
      return NextResponse.json({
        ok: true,
        mode: "delta",
        count: 0,
        message: "No new records since last sync",
        ms: Date.now() - start,
      })
    }

    const salons = await fetchSalonsByIds(changedIds)
    await upsertSalons(salons)
    await updateSyncMeta({ lastDeltaSync: new Date().toISOString() })
    revalidateTag(SALON_CACHE_TAG)

    return NextResponse.json({
      ok: true,
      mode: "delta",
      changedIds: changedIds.length,
      salonsUpdated: salons.length,
      ms: Date.now() - start,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), ms: Date.now() - start },
      { status: 500 }
    )
  }
}
