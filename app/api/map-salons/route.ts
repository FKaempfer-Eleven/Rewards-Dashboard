// All salons for a given state/province — used for map drill-down pins.
// Returns lightweight records (no monthly history); caller computes pin coords.

import { NextRequest, NextResponse } from "next/server"
import { fetchAllRows } from "@/lib/paginate"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const state = (sp.get("state") ?? "").trim().toUpperCase()
  const excludeZeroSpend = sp.get("excludeZeroSpend") === "true"

  const { supabase } = await import("@/lib/supabase-client")

  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    // Page through all matching rows — large states (CA, TX, FL) exceed the
    // 1000-row response cap, so a single query would drop most of their pins.
    const data = await fetchAllRows<Record<string, unknown>>((from, to) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("salon_cache")
        .select("id, salon_name, city, state, zip, acct_number, distributor_code, distributor_idx, lifetime_sales, is_active")
      if (state) q = q.eq("state", state)
      if (excludeZeroSpend) q = q.gte("last_purchase", oneYearAgo)
      return q.range(from, to)
    })

    const salons = data.map((s: Record<string, unknown>) => ({
      id: s.id,
      salonName: s.salon_name,
      city: s.city,
      state: s.state,
      zip: s.zip ?? null,
      acctnumber: s.acct_number ?? null,
      distributorCode: s.distributor_code,
      distributorIdx: Number(s.distributor_idx ?? -1),
      lifetimeSales: Number(s.lifetime_sales ?? 0),
      isActive: Boolean(s.is_active),
    }))

    return NextResponse.json({ count: salons.length, salons })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
