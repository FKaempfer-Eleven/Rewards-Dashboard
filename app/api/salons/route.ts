import { NextRequest, NextResponse } from "next/server"
import { getAllSalons } from "@/lib/salon-cache"
import type { LiveSalon } from "@/lib/live-salon"

// Allow up to 60s on Pro plan; Hobby plan caps at 10s but unstable_cache
// means cold starts only happen once per hour — subsequent requests are instant.
export const maxDuration = 60

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const page = Math.max(0, Number(sp.get("page") ?? 0))
  const search = (sp.get("search") ?? "").trim().toLowerCase()
  const distCodes = (sp.get("distributor") ?? "").split(",").filter(Boolean) // ["EVO","UBE",…]
  const state = (sp.get("state") ?? "").trim().toUpperCase()
  const minSpend = Number(sp.get("minSpend") ?? 0)
  const activeOnly = sp.get("activeOnly") === "true"
  const noEmailOnly = sp.get("noEmailOnly") === "true"
  const sort = sp.get("sort") ?? "sales"
  const dir = sp.get("dir") === "asc" ? 1 : -1

  // ── Load (cached) full salon list ──────────────────────────────────────────
  let salons: LiveSalon[]
  try {
    salons = await getAllSalons()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code = msg.includes("env vars are not set") ? 503 : 502
    return NextResponse.json({ error: code === 503 ? "not_configured" : "fetch_failed", message: msg }, { status: code })
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  let filtered = salons

  if (distCodes.length > 0) {
    filtered = filtered.filter(
      (s) => s.distributorCode !== null && distCodes.includes(s.distributorCode)
    )
  }
  if (state) {
    filtered = filtered.filter((s) => (s.state ?? "").toUpperCase() === state)
  }
  if (minSpend > 0) {
    filtered = filtered.filter((s) => s.lifetimeSales >= minSpend)
  }
  if (activeOnly) {
    filtered = filtered.filter((s) => s.isActive)
  }
  if (noEmailOnly) {
    filtered = filtered.filter((s) => !s.email)
  }
  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.salonName.toLowerCase().includes(search) ||
        (s.city ?? "").toLowerCase().includes(search) ||
        (s.state ?? "").toLowerCase().includes(search) ||
        (s.email ?? "").toLowerCase().includes(search) ||
        (s.acctnumber ?? "").toLowerCase().includes(search)
    )
  }

  // ── Aggregate stats (full filtered set) ───────────────────────────────────
  const n = filtered.length
  let totalSales = 0
  let totalAvgMonthly = 0
  let activeCount = 0

  for (const s of filtered) {
    totalSales += s.lifetimeSales
    totalAvgMonthly += s.avgMonthlySales
    if (s.isActive) activeCount++
  }

  // ── Sort ───────────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "name":        return dir * a.salonName.localeCompare(b.salonName)
      case "avgMonthly":  return dir * (a.avgMonthlySales - b.avgMonthlySales)
      case "points":      return dir * (a.lifetimePointsIssued - b.lifetimePointsIssued)
      case "lastPurchase":return dir * ((a.lastPurchase ?? "").localeCompare(b.lastPurchase ?? ""))
      default:            return dir * (a.lifetimeSales - b.lifetimeSales)  // "sales"
    }
  })

  // ── Paginate ───────────────────────────────────────────────────────────────
  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const slice = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return NextResponse.json({
    total,
    page: safePage,
    pages,
    aggregates: {
      totalSales,
      avgSales: n ? totalSales / n : 0,
      avgMonthly: n ? totalAvgMonthly / n : 0,
      activeCount,
    },
    salons: slice,
  })
}
