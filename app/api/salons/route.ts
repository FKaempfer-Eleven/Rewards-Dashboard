// Salon Explorer API — server-side filter / sort / paginate via Supabase.
// Bypasses the in-memory getAllSalons() cache so large filter sets are fast:
// each request hits the DB with a predicate instead of loading 15k rows.

import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

const PAGE_SIZE = 50

type SortKey = "sales" | "avgMonthly" | "points" | "lastPurchase" | "name"

const SORT_COL: Record<SortKey, string> = {
  sales:       "lifetime_sales",
  avgMonthly:  "avg_monthly_sales",
  points:      "lifetime_points_issued",
  lastPurchase:"last_purchase",
  name:        "salon_name",
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const page      = Math.max(0, Number(sp.get("page") ?? 0))
  const search    = (sp.get("search") ?? "").trim().toLowerCase()
  const distCodes = (sp.get("distributor") ?? "").split(",").filter(Boolean)
  const state     = (sp.get("state") ?? "").trim().toUpperCase()
  const minSpend  = Number(sp.get("minSpend") ?? 0)
  const activeOnly        = sp.get("activeOnly") === "true"
  const noEmailOnly       = sp.get("noEmailOnly") === "true"
  const excludeZeroSpend  = sp.get("excludeZeroSpend") === "true"
  const sortKey   = (sp.get("sort") ?? "sales") as SortKey
  const dir       = sp.get("dir") === "asc"
  const col       = SORT_COL[sortKey] ?? "lifetime_sales"

  const { supabase } = await import("@/lib/supabase-client")

  // ── Helper: apply shared filter predicates ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any) {
    if (distCodes.length > 0) q = q.in("distributor_code", distCodes)
    if (state)      q = q.eq("state", state)
    if (minSpend > 0) q = q.gte("lifetime_sales", minSpend)
    if (activeOnly) q = q.eq("is_active", true)
    if (noEmailOnly) q = q.is("email", null)
    if (excludeZeroSpend) {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      q = q.gte("last_purchase", oneYearAgo)
    }
    if (search) {
      // OR across text columns
      q = q.or(
        `salon_name.ilike.%${search}%,` +
        `acct_number.ilike.%${search}%,` +
        `city.ilike.%${search}%,` +
        `state.ilike.%${search}%,` +
        `email.ilike.%${search}%`
      )
    }
    return q
  }

  try {
    // ── 1. Aggregates over the full filtered set (lightweight columns only) ──
    const aggQ = applyFilters(
      supabase
        .from("salon_cache")
        .select("lifetime_sales, avg_monthly_sales, is_active", { count: "exact" })
    )
    const { data: aggRows, count: total, error: aggErr } = await aggQ
    if (aggErr) throw new Error(aggErr.message)

    const n = total ?? 0
    let totalSales = 0, totalAvgMonthly = 0, activeCount = 0
    for (const r of aggRows ?? []) {
      totalSales       += Number(r.lifetime_sales ?? 0)
      totalAvgMonthly  += Number(r.avg_monthly_sales ?? 0)
      if (r.is_active) activeCount++
    }

    // ── 2. Paginated rows for display ──────────────────────────────────────
    const pages    = Math.max(1, Math.ceil(n / PAGE_SIZE))
    const safePage = Math.min(page, pages - 1)
    const offset   = safePage * PAGE_SIZE

    // last_purchase can be null — sort nulls last
    const dataQ = applyFilters(
      supabase
        .from("salon_cache")
        .select("*")
    )
      .order(col, { ascending: dir, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1)

    const { data: rows, error: dataErr } = await dataQ
    if (dataErr) throw new Error(dataErr.message)

    // Map DB rows to the LiveSalon shape the frontend expects
    const salons = (rows ?? []).map((row) => ({
      id:                     row.id,
      rawName:                row.raw_name ?? "",
      salonName:              row.salon_name ?? "",
      contactName:            row.contact_name ?? "",
      email:                  row.email ?? null,
      city:                   row.city ?? null,
      state:                  row.state ?? null,
      zip:                    row.zip ?? null,
      country:                row.country ?? null,
      acctnumber:             row.acct_number ?? null,
      distributorCode:        row.distributor_code ?? null,
      distributorIdx:         Number(row.distributor_idx ?? -1),
      lifetimeSales:          Number(row.lifetime_sales ?? 0),
      lifetimePointsIssued:   Number(row.lifetime_points_issued ?? 0),
      lifetimePointsRedeemed: Number(row.lifetime_points_redeemed ?? 0),
      pointsBalance:          Number(row.points_balance ?? 0),
      monthCount:             Number(row.month_count ?? 0),
      lastPurchase:           row.last_purchase
                                ? new Date(row.last_purchase as string).toISOString()
                                : null,
      isActive:               Boolean(row.is_active),
      avgMonthlySales:        Number(row.avg_monthly_sales ?? 0),
    }))

    return NextResponse.json({
      total: n,
      page: safePage,
      pages,
      aggregates: {
        totalSales,
        avgSales:   n ? totalSales / n : 0,
        avgMonthly: n ? totalAvgMonthly / n : 0,
        activeCount,
      },
      salons,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = msg.includes("env vars") ? 503 : 502
    return NextResponse.json(
      { error: code === 503 ? "not_configured" : "fetch_failed", message: msg },
      { status: code }
    )
  }
}
