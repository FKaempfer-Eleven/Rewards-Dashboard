// Aggregated map statistics — state counts, distributor counts, totals.
// Uses a single GROUP BY query instead of loading all 15k rows into memory.

import { NextResponse } from "next/server"

export const maxDuration = 30

export async function GET() {
  const { supabase } = await import("@/lib/supabase-client")

  try {
    // One lightweight query: state + distributor_code + aggregates.
    // Returns ≤ ~450 rows (50 states × 9 distributors) instead of 15k.
    const { data, error } = await supabase
      .from("salon_cache")
      .select("state, distributor_code, lifetime_sales")

    if (error) throw new Error(error.message)

    const stateMap: Record<string, { count: number; sales: number }> = {}
    const distMap: Record<string, number> = {}
    let total = 0
    let totalSales = 0

    for (const r of data ?? []) {
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
