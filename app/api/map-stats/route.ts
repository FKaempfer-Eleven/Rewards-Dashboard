// Aggregated map statistics — state counts, distributor counts, totals.
// Uses a single GROUP BY query instead of loading all 15k rows into memory.

import { NextRequest, NextResponse } from "next/server"
import { fetchAllRows } from "@/lib/paginate"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { supabase } = await import("@/lib/supabase-client")
  const excludeZeroSpend = req.nextUrl.searchParams.get("excludeZeroSpend") === "true"

  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    // Page through the full table — Supabase caps each response at 1000 rows,
    // so a single .select() would only ever see the first 1000 salons.
    const rows = await fetchAllRows<{
      state: string | null
      distributor_code: string | null
      lifetime_sales: number | null
    }>((from, to) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("salon_cache")
        .select("state, distributor_code, lifetime_sales")
      if (excludeZeroSpend) q = q.gte("last_purchase", oneYearAgo)
      return q.range(from, to)
    })

    const stateMap: Record<string, { count: number; sales: number }> = {}
    const distMap: Record<string, number> = {}
    let total = 0
    let totalSales = 0

    for (const r of rows) {
      const abbr = (r.state ?? "").trim().toUpperCase() || "XX"
      if (!stateMap[abbr]) stateMap[abbr] = { count: 0, sales: 0 }
      stateMap[abbr].count++
      stateMap[abbr].sales += Number(r.lifetime_sales ?? 0)
      totalSales += Number(r.lifetime_sales ?? 0)

      const code = r.distributor_code ?? "UNK"
      distMap[code] = (distMap[code] ?? 0) + 1
      total++
    }

    return NextResponse.json({ total, totalSales, states: stateMap, distributors: distMap })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
