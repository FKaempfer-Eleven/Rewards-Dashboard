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

  // Sub-batch size sent to Census per round; the route drains several rounds
  // per invocation until a time budget is hit, committing after each round.
  const chunk = Math.min(2000, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 500)))
  const budgetMs = Math.min(50_000, Math.max(5_000, Number(req.nextUrl.searchParams.get("budgetMs") ?? 22_000)))
  const start = Date.now()

  const isCanada = (c: string | null) => (c ?? "").trim().toUpperCase().startsWith("CA")

  try {
    const { supabase } = await import("@/lib/supabase-client")
    const now = new Date().toISOString()

    let processed = 0
    let matched = 0
    let canadaSkipped = 0
    let rounds = 0
    let censusError: string | null = null

    while (Date.now() - start < budgetMs) {
      const { data, error } = await supabase
        .from("salon_cache")
        .select("id, street1, street2, city, state, zip, country")
        .is("geocode_status", null)
        .not("street1", "is", null)
        .limit(chunk)
      if (error) throw new Error(error.message)

      const rows = (data ?? []) as Row[]
      if (rows.length === 0) break

      const usRows = rows.filter((r) => !isCanada(r.country))
      const caRows = rows.filter((r) => isCanada(r.country))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any[] = []
      for (const r of caRows) {
        updates.push({ id: r.id, geocode_status: "ca_pending", geocoded_at: now })
      }
      canadaSkipped += caRows.length

      if (usRows.length > 0) {
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
        form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv")

        // Fail fast if Census is slow / rate-limiting, so the function never
        // hangs to the platform timeout. On error, stop and keep prior commits.
        let text: string
        try {
          const res = await fetch(CENSUS_URL, {
            method: "POST",
            body: form,
            signal: AbortSignal.timeout(15_000),
          })
          if (!res.ok) throw new Error(`Census returned ${res.status}`)
          text = await res.text()
        } catch (e) {
          censusError = String(e)
          break
        }

        // Columns: id, input, matchIndicator, matchType, matchedAddress, "lon,lat", tigerlineId, side
        for (const line of text.split("\n")) {
          if (!line.trim()) continue
          const f = parseCsvLine(line)
          const id = f[0]
          const indicator = (f[2] ?? "").trim()
          if (indicator === "Match" && f[5]) {
            const [lon, lat] = f[5].split(",").map((n) => Number(n))
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              updates.push({ id, lat, lng: lon, geocode_status: "match", geocoded_at: now })
              matched++
              continue
            }
          }
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
      }

      processed += rows.length
      rounds++
    }

    if (processed > 0) revalidateTag(SALON_CACHE_TAG, "default")

    const { count: remaining } = await supabase
      .from("salon_cache")
      .select("id", { count: "exact", head: true })
      .is("geocode_status", null)
      .not("street1", "is", null)

    return NextResponse.json({
      ok: true,
      done: (remaining ?? 0) === 0,
      rounds,
      processed,
      matched,
      canadaSkipped,
      remaining: remaining ?? 0,
      censusError,
      ms: Date.now() - start,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), ms: Date.now() - start },
      { status: 500 }
    )
  }
}
