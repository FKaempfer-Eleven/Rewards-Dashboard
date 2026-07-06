// All salons for a given state/province — used for map drill-down pins.
// Returns lightweight records (no monthly history); caller computes pin coords.

import { NextRequest, NextResponse } from "next/server"
import { getAllSalons } from "@/lib/salon-cache"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const state = (req.nextUrl.searchParams.get("state") ?? "").trim().toUpperCase()

  let salons
  try {
    salons = await getAllSalons()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  const filtered = state
    ? salons.filter((s) => (s.state ?? "").trim().toUpperCase() === state)
    : salons

  return NextResponse.json({
    count: filtered.length,
    salons: filtered.map((s) => ({
      id: s.id,
      salonName: s.salonName,
      city: s.city,
      state: s.state,
      distributorCode: s.distributorCode,
      distributorIdx: s.distributorIdx,
      lifetimeSales: s.lifetimeSales,
      isActive: s.isActive,
    })),
  })
}
