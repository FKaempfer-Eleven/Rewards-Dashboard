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
import { type LiveSalon } from "@/lib/live-salon"
import {
  SALON_CACHE_TAG,
  fetchAllFromDataverse,
  fetchSalonsByIds,
} from "@/lib/salon-cache"

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
    const rawCookie = data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"] as string | undefined
    cookie = rawCookie ? decodeURIComponent(rawCookie) : undefined
    page++
  }

  return Array.from(ids)
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
      const { salons, phase1Pages, phase1HeaderRows, phase1UniqueIds, phase2Batches } =
        await fetchAllFromDataverse()
      await upsertSalons(salons)
      await updateSyncMeta({
        lastFullSync: new Date().toISOString(),
        lastDeltaSync: new Date().toISOString(),
        salonCount: salons.length,
      })
      revalidateTag(SALON_CACHE_TAG, "default")
      return NextResponse.json({
        ok: true,
        mode: "full",
        count: salons.length,
        phase1: { pages: phase1Pages, headerRows: phase1HeaderRows, uniqueIds: phase1UniqueIds },
        phase2: { batches: phase2Batches },
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
    revalidateTag(SALON_CACHE_TAG, "default")

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
