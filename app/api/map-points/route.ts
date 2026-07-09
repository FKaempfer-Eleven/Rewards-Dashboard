// Geocoded salon points for the Leaflet map. Returns every salon that has
// real lat/lng coordinates (from /api/geocode), paged past the 1000-row cap.

import { NextRequest, NextResponse } from "next/server"
import { fetchAllRows } from "@/lib/paginate"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const excludeZeroSpend = req.nextUrl.searchParams.get("excludeZeroSpend") === "true"
  const { supabase } = await import("@/lib/supabase-client")

  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("salon_cache")
        .select("id, salon_name, city, state, zip, acct_number, distributor_idx, distributor_code, lifetime_sales, is_active, lat, lng")
        .not("lat", "is", null)
      if (excludeZeroSpend) q = q.gte("last_purchase", oneYearAgo)
      return q.range(from, to)
    })

    // Compact tuple-ish objects to keep the payload small for ~15k points.
    const points = rows.map((s: Record<string, unknown>) => ({
      id: s.id,
      n: s.salon_name,
      c: s.city,
      st: s.state,
      z: s.zip,
      a: s.acct_number,
      d: Number(s.distributor_idx ?? -1),
      dc: s.distributor_code,
      v: Number(s.lifetime_sales ?? 0),
      act: Boolean(s.is_active),
      lat: Number(s.lat),
      lng: Number(s.lng),
    }))

    return NextResponse.json({ count: points.length, points })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
