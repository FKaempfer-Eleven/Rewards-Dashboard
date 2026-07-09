// Geocoding backfill — resolves salon street addresses to lat/lng coordinates
// using the free U.S. Census batch geocoder (no API key required).
//
//   GET /api/geocode?secret=<CRON_SECRET>&limit=500
//
// Processes one batch of not-yet-geocoded salons per call and reports how many
// remain, so it can be called repeatedly (or on a cron) until complete.
// Canadian salons are skipped (marked "ca_pending") — the Census locator is
// U.S.-only — and can be handled by a separate pass later.

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { SALON_CACHE_TAG } from "@/lib/salon-cache"

export const maxDuration = 60

const CENSUS_URL =
  "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev mode
  const header = req.headers.get("authorization")?.replace("Bearer ", "")
  const query = req.nextUrl.searchParams.get("secret")
  return header === secret || query === secret
}

/** Parse a single CSV line, honoring double-quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}

function csvField(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`
}

type Row = {
  id: string
  street1: string | null
  street2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limit = Math.min(
    5000,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 500))
  )
  const start = Date.now()

  try {
    const { supabase } = await import("@/lib/supabase-client")

    // Pull the next batch of un-geocoded salons that have a street address.
    const { data, error } = await supabase
      .from("salon_cache")
      .select("id, street1, street2, city, state, zip, country")
      .is("geocode_status", null)
      .not("street1", "is", null)
      .limit(limit)
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as Row[]
    if (rows.length === 0) {
      const { count } = await supabase
        .from("salon_cache")
        .select("id", { count: "exact", head: true })
        .not("lat", "is", null)
      return NextResponse.json({
        ok: true,
        done: true,
        message: "No un-geocoded salons remaining",
        geocodedTotal: count ?? 0,
        ms: Date.now() - start,
      })
    }

    const isCanada = (c: string | null) =>
      (c ?? "").trim().toUpperCase().startsWith("CA")

    const usRows = rows.filter((r) => !isCanada(r.country))
    const caRows = rows.filter((r) => isCanada(r.country))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any[] = []
    const now = new Date().toISOString()

    // Mark Canadian salons as pending (Census locator is U.S.-only).
    for (const r of caRows) {
      updates.push({ id: r.id, geocode_status: "ca_pending", geocoded_at: now })
    }

    let matched = 0
    if (usRows.length > 0) {
      // Build the Census batch CSV: id, street, city, state, zip (no header).
      const csv = usRows
        .map((r) => {
          const street = [r.street1, r.street2].filter(Boolean).join(" ")
          return [
            csvField(r.id),
            csvField(street),
            csvField(r.city ?? ""),
            csvField(r.state ?? ""),
            csvField(r.zip ?? ""),
          ].join(",")
        })
        .join("\n")

      const form = new FormData()
      form.append("benchmark", "Public_AR_Current")
      form.append(
        "addressFile",
        new Blob([csv], { type: "text/csv" }),
        "addresses.csv"
      )

      const res = await fetch(CENSUS_URL, { method: "POST", body: form })
      if (!res.ok) {
        throw new Error(`Census geocoder returned ${res.status}: ${await res.text()}`)
      }
      const text = await res.text()

      // Response CSV columns:
      // id, input, matchIndicator, matchType, matchedAddress, "lon,lat", tigerlineId, side
      for (const line of text.split("\n")) {
        if (!line.trim()) continue
        const f = parseCsvLine(line)
        const id = f[0]
        const indicator = (f[2] ?? "").trim()
        if (indicator === "Match" && f[5]) {
          const [lon, lat] = f[5].split(",").map((n) => Number(n))
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            updates.push({
              id,
              lat,
              lng: lon,
              geocode_status: "match",
              geocoded_at: now,
            })
            matched++
            continue
          }
        }
        // No_Match or Tie — record the attempt so we don't retry endlessly.
        updates.push({
          id,
          geocode_status: indicator === "Tie" ? "tie" : "no_match",
          geocoded_at: now,
        })
      }
    }

    if (updates.length > 0) {
      const { error: upErr } = await supabase
        .from("salon_cache")
        .upsert(updates, { onConflict: "id" })
      if (upErr) throw new Error(`Supabase update failed: ${upErr.message}`)
      revalidateTag(SALON_CACHE_TAG, "default")
    }

    // How many still need geocoding after this batch?
    const { count: remaining } = await supabase
      .from("salon_cache")
      .select("id", { count: "exact", head: true })
      .is("geocode_status", null)
      .not("street1", "is", null)

    return NextResponse.json({
      ok: true,
      done: (remaining ?? 0) === 0,
      batch: rows.length,
      usAttempted: usRows.length,
      matched,
      canadaSkipped: caRows.length,
      remaining: remaining ?? 0,
      ms: Date.now() - start,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), ms: Date.now() - start },
      { status: 500 }
    )
  }
}
