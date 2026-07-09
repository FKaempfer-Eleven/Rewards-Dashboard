"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { PageHeader } from "@/components/panel"
import { useToast } from "@/components/toast"
import type { QuickQuery } from "@/components/dashboard"
import { DISTRIBUTORS, STATES, fmt, usd, usdC } from "@/lib/data"
import { type LiveSalon, lastPurchaseLabel } from "@/lib/live-salon"
import { SalonDetailPanel } from "@/components/views/salon-detail-panel"

const PAGE_SIZE = 50

type SortKey = "sales" | "avgMonthly" | "points" | "lastPurchase" | "name"

const COLS: { label: string; sortKey?: SortKey; right?: boolean }[] = [
  { label: "Salon" },
  { label: "Location" },
  { label: "Zip" },
  { label: "Distributor" },
  { label: "Lifetime spend", sortKey: "sales", right: true },
  { label: "Avg / mo", sortKey: "avgMonthly", right: true },
  { label: "Points issued", sortKey: "points", right: true },
  { label: "Last purchase", sortKey: "lastPurchase" },
  { label: "Status" },
]

type ApiResponse = {
  total: number
  page: number
  pages: number
  aggregates: { totalSales: number; avgSales: number; avgMonthly: number; activeCount: number }
  salons: LiveSalon[]
}

type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: ApiResponse }
  | { status: "error"; message: string }
  | { status: "not_configured" }

export function SalonExplorerView({
  search,
  onSearchChange,
  quickQuery,
}: {
  search: string
  onSearchChange: (v: string) => void
  quickQuery: { q: QuickQuery; nonce: number }
}) {
  const toast = useToast()
  const tableTop = useRef<HTMLDivElement>(null)

  const [distFilter, setDistFilter] = useState<Set<string>>(new Set())   // codes: "EVO", "UBE", …
  const [stateFilter, setStateFilter] = useState("")
  const [minSpend, setMinSpend] = useState(0)
  const [activeOnly, setActiveOnly] = useState(false)
  const [noEmailOnly, setNoEmailOnly] = useState(false)
  const [excludeZeroSpend, setExcludeZeroSpend] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("sales")
  const [sortDir, setSortDir] = useState<-1 | 1>(-1)
  const [page, setPage] = useState(0)
  const [apiState, setApiState] = useState<ApiState>({ status: "idle" })
  const [selectedSalon, setSelectedSalon] = useState<LiveSalon | null>(null)

  // ── Build query string ──────────────────────────────────────────────────────
  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("sort", sortKey)
    p.set("dir", sortDir < 0 ? "desc" : "asc")
    if (distFilter.size) p.set("distributor", [...distFilter].join(","))
    if (stateFilter) p.set("state", stateFilter)
    if (minSpend > 0) p.set("minSpend", String(minSpend))
    if (activeOnly) p.set("activeOnly", "true")
    if (noEmailOnly) p.set("noEmailOnly", "true")
    if (excludeZeroSpend) p.set("excludeZeroSpend", "true")
    if (search.trim()) p.set("search", search.trim())
    return p.toString()
  }, [page, sortKey, sortDir, distFilter, stateFilter, minSpend, activeOnly, noEmailOnly, excludeZeroSpend, search])

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchSalons = useCallback(async (qs: string) => {
    setApiState({ status: "loading" })
    try {
      const res = await fetch(`/api/salons?${qs}`)
      const json = await res.json()
      if (!res.ok) {
        if (json.error === "not_configured") {
          setApiState({ status: "not_configured" })
        } else {
          setApiState({ status: "error", message: json.message ?? "Unknown error" })
        }
        return
      }
      setApiState({ status: "ok", data: json as ApiResponse })
    } catch (e) {
      setApiState({ status: "error", message: String(e) })
    }
  }, [])

  useEffect(() => {
    fetchSalons(queryString)
  }, [queryString, fetchSalons])

  // ── Quick query handoff ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!quickQuery.q) return
    setDistFilter(new Set())
    setStateFilter("")
    setMinSpend(0)
    setActiveOnly(false)
    setNoEmailOnly(false)
    setExcludeZeroSpend(false)
    onSearchChange("")
    setPage(0)
    if (quickQuery.q === "top") {
      setSortKey("sales")
      setSortDir(-1)
      setMinSpend(20000)
    } else if (quickQuery.q === "ca") {
      setStateFilter("CA")
      setDistFilter(new Set(["WES"]))
    } else if (quickQuery.q === "errors") {
      setNoEmailOnly(true)
      setSortKey("sales")
      setSortDir(-1)
      toast("Showing salons with no email on file")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickQuery.nonce])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function toggleDist(code: string) {
    setDistFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
    setPage(0)
  }

  function clearAll() {
    setDistFilter(new Set())
    setStateFilter("")
    setMinSpend(0)
    setActiveOnly(false)
    setNoEmailOnly(false)
    setExcludeZeroSpend(false)
    onSearchChange("")
    setPage(0)
  }

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1))
    else { setSortKey(k); setSortDir(-1) }
    setPage(0)
  }

  function gotoPage(p: number) {
    setPage(p)
    tableTop.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  // ── Derived display values ──────────────────────────────────────────────────
  const data = apiState.status === "ok" ? apiState.data : null
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const salons = data?.salons ?? []
  const agg = data?.aggregates
  const start = (data?.page ?? 0) * PAGE_SIZE

  const stats = agg
    ? [
        { l: noEmailOnly ? "Records missing email" : "Matching salons", v: fmt(total) },
        { l: noEmailOnly ? "Blocked spend" : "Total lifetime spend", v: usdC(agg.totalSales) },
        { l: "Avg lifetime spend", v: usd(agg.avgSales) },
        { l: "Avg spend / month", v: usd(agg.avgMonthly) },
        { l: "Active members", v: total ? `${((agg.activeCount / total) * 100).toFixed(0)}%` : "0%" },
      ]
    : null

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <section>
        <PageHeader
          eyebrow="Members across the U.S. & Canada"
          title="Salon Explorer"
          description="Filter the full member base by distributor, state, and spend. Stats update live with your filters."
        />

        {/* Filters */}
        <div className="mb-4 rounded-[14px] border border-line bg-card p-4 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="min-w-[280px] flex-1">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
                Distributor
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DISTRIBUTORS.map((d) => {
                  const on = distFilter.has(d.code)
                  return (
                    <button
                      key={d.code}
                      onClick={() => toggleDist(d.code)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        on
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-paper2 text-ink2 hover:border-faint"
                      }`}
                    >
                      <i className="size-2 rounded-full" style={{ background: d.color }} />
                      {d.short}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
                State
              </label>
              <select
                value={stateFilter}
                onChange={(e) => { setStateFilter(e.target.value); setPage(0) }}
                className="h-9 rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink outline-none focus:border-coral"
              >
                <option value="">All states</option>
                {STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-[200px]">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
                Minimum lifetime spend
              </label>
              <input
                type="range"
                min={0}
                max={40000}
                step={1000}
                value={minSpend}
                onChange={(e) => { setMinSpend(+e.target.value); setPage(0) }}
                className="w-full accent-coral"
              />
              <div className="mt-1 text-[12px] text-muted">
                ≥ <b className="text-ink">{usd(minSpend)}</b>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
                Activity
              </label>
              <button
                onClick={() => { setActiveOnly((v) => !v); setPage(0) }}
                className="flex items-center gap-2.5 text-[13px] font-medium text-ink2"
              >
                <span
                  className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
                    activeOnly ? "bg-gen" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                      activeOnly ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                Active members only
              </button>
              <button
                onClick={() => { setExcludeZeroSpend((v) => !v); setPage(0) }}
                className="flex items-center gap-2.5 text-[13px] font-medium text-ink2"
              >
                <span
                  className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
                    excludeZeroSpend ? "bg-coral" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                      excludeZeroSpend ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                Exclude $0 in last 12 months
              </button>
            </div>

            <button
              onClick={clearAll}
              className="ml-auto rounded-full border border-line bg-paper2 px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-coral hover:text-coral-deep"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Stat line */}
        {stats && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((x) => (
              <div
                key={x.l}
                className="rounded-[12px] border border-line bg-card px-4 py-3 shadow-[var(--shadow)]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted">{x.l}</div>
                <div className="mt-1.5 font-display text-[20px] font-semibold tabular-nums text-ink">{x.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Not configured banner */}
        {apiState.status === "not_configured" && (
          <div className="mb-4 rounded-[14px] border border-peach bg-gradient-to-b from-white to-[#fff6f3] px-5 py-4 text-[13.5px]">
            <p className="font-semibold text-coral-deep">API credentials not configured</p>
            <p className="mt-1 text-muted">
              Add <code className="rounded bg-paper2 px-1.5 py-0.5 font-mono text-[12px]">DATAVERSE_CLIENT_ID</code> and{" "}
              <code className="rounded bg-paper2 px-1.5 py-0.5 font-mono text-[12px]">DATAVERSE_CLIENT_SECRET</code> to
              your Vercel project settings. See <code className="font-mono text-[12px]">lib/dataverse-client.ts</code> for the
              setup checklist.
            </p>
          </div>
        )}

        {/* Error banner */}
        {apiState.status === "error" && (
          <div className="mb-4 rounded-[14px] border border-line bg-err-soft px-5 py-4 text-[13px] text-coral-deep">
            Failed to load salons: {apiState.message}
          </div>
        )}

        {/* Table */}
        <div
          ref={tableTop}
          className="overflow-hidden rounded-[14px] border border-line bg-card shadow-[var(--shadow)]"
        >
          <div className="flex items-center justify-between border-b border-line2 px-5 py-3.5 text-[13px]">
            <div className="text-muted">
              {apiState.status === "loading" ? (
                <span className="flex items-center gap-2 text-faint">
                  <Loader2 className="size-4 animate-spin" /> Loading salons…
                </span>
              ) : (
                <>
                  <b className="text-ink">{fmt(total)}</b>{" "}
                  {noEmailOnly ? "records missing email" : "salons match"}
                </>
              )}
            </div>
            <div className="text-faint">
              {total > 0 && apiState.status === "ok"
                ? `${start + 1}–${Math.min(start + PAGE_SIZE, total)} shown`
                : ""}
            </div>
          </div>

          <div className="max-h-[58dvh] overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-paper2">
                <tr>
                  {COLS.map((c) => {
                    const active = c.sortKey !== undefined && sortKey === c.sortKey
                    return (
                      <th
                        key={c.label}
                        onClick={() => c.sortKey !== undefined && onSort(c.sortKey)}
                        className={`border-b border-line2 px-4 py-2.5 font-display text-[11px] font-medium uppercase tracking-[0.8px] ${
                          c.right ? "text-right" : "text-left"
                        } ${c.sortKey !== undefined ? "cursor-pointer select-none" : ""} ${
                          active ? "text-coral" : "text-muted"
                        }`}
                      >
                        {c.label}
                        {c.sortKey !== undefined && (
                          <span className="ml-1 text-[10px]">
                            {active ? (sortDir < 0 ? "▼" : "▲") : "↕"}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {salons.map((s, i) => {
                  const dist =
                    s.distributorIdx >= 0 ? DISTRIBUTORS[s.distributorIdx] : null
                  return (
                    <tr
                      key={s.id ?? i}
                      onClick={() => setSelectedSalon(s)}
                      className="cursor-pointer border-b border-line2/70 hover:bg-peach-soft"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink">{s.salonName}</div>
                        <div className="text-[11.5px] text-faint">
                          {s.email || <span className="text-coral">no email on file</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {s.city && s.state ? `${s.city}, ${s.state}` : s.city || s.state || "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted">
                        {s.zip || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {dist ? (
                          <span className="inline-flex items-center gap-1.5">
                            <i className="size-2 rounded-full" style={{ background: dist.color }} />
                            {dist.short}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {usd(s.lifetimeSales)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink2">
                        {usd(s.avgMonthlySales)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink2">
                        {fmt(s.lifetimePointsIssued)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{lastPurchaseLabel(s.lastPurchase)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            s.isActive
                              ? "bg-gen-soft text-[#1f7256]"
                              : "bg-miss-soft text-muted"
                          }`}
                        >
                          <i
                            className="size-1.5 rounded-full"
                            style={{ background: s.isActive ? "#2F9E78" : "#C8BBAE" }}
                          />
                          {s.isActive ? "Active" : "Dormant"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {apiState.status === "ok" && salons.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-12 text-center text-muted">
                      No salons match the current filters.
                    </td>
                  </tr>
                )}
                {(apiState.status === "idle" || apiState.status === "loading") &&
                  salons.length === 0 && (
                    <tr>
                      <td colSpan={COLS.length} className="px-4 py-16 text-center text-faint">
                        <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                        Loading salon data from Dataverse…
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-3 border-t border-line2 px-5 py-3 text-[13px]">
            <button
              disabled={page === 0}
              onClick={() => gotoPage(page - 1)}
              className="grid size-8 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper2 disabled:opacity-40"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="text-muted">
              Page {(data?.page ?? 0) + 1} of {fmt(pages)}
            </span>
            <button
              disabled={page >= pages - 1}
              onClick={() => gotoPage(page + 1)}
              className="grid size-8 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper2 disabled:opacity-40"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      <SalonDetailPanel salon={selectedSalon} onClose={() => setSelectedSalon(null)} />
    </>
  )
}
