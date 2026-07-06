// Aggregated map statistics — state counts, distributor counts, totals.
// Backed by the same in-memory salon cache as /api/salons.

import { NextResponse } from "next/server"
import { getAllSalons } from "@/lib/salon-cache"

export const maxDuration = 60

export async function GET() {
  let salons
  try {
    salons = await getAllSalons()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  const stateMap: Record<string, { count: number; sales: number }> = {}
  const distMap: Record<string, number> = {}
  let totalSales = 0

  for (const s of salons) {
    const abbr = (s.state ?? "").trim().toUpperCase() || "XX"
    if (!stateMap[abbr]) stateMap[abbr] = { count: 0, sales: 0 }
    stateMap[abbr].count++
    stateMap[abbr].sales += s.lifetimeSales
    totalSales += s.lifetimeSales

    const code = s.distributorCode ?? "UNK"
    distMap[code] = (distMap[code] ?? 0) + 1
  }

  return NextResponse.json({
    total: salons.length,
    totalSales,
    states: stateMap,   // { "CA": { count: 168, sales: 1234567 }, … }
    distributors: distMap, // { "EVO": 420, "SSG": 310, … }
  })
}
