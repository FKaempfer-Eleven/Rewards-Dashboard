"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { PageHeader } from "@/components/panel"
import { useToast } from "@/components/toast"
import type { QuickQuery } from "@/components/dashboard"
import {
  DISTRIBUTORS,
  MONTHS,
  SALON,
  SALONS,
  STATES,
  type Salon,
  emailFor,
  fmt,
  isActive,
  salonCity,
  salonName,
  usd,
  usdC,
} from "@/lib/data"
import { SalonDetailPanel } from "@/components/views/salon-detail-panel"

const PAGE = 50

type SortKey = typeof SALON.spend | typeof SALON.avg | typeof SALON.points | typeof SALON.last

const COLS: {
  label: string
  sortKey?: SortKey
  right?: boolean
}[] = [
  { label: "Salon" },
  { label: "Location" },
  { label: "Distributor" },
  { label: "Lifetime spend", sortKey: SALON.spend, right: true },
  { label: "Avg / mo", sortKey: SALON.avg, right: true },
  { label: "Points balance", sortKey: SALON.points, right: true },
  { label: "Last purchase", sortKey: SALON.last },
  { label: "Status" },
]

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

  const [distFilter, setDistFilter] = useState<Set<number>>(new Set())
  const [stateFilter, setStateFilter] = useState("")
  const [minSpend, setMinSpend] = useState(0)
  const [activeOnly, setActiveOnly] = useState(false)
  const [noEmailOnly, setNoEmailOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(SALON.spend)
  const [sortDir, setSortDir] = useState<-1 | 1>(-1)
  const [page, setPage] = useState(0)
  const [selectedSalon, setSelectedSalon] = useState<Salon | null>(null)

  // react to quick query handoff from overview
  useEffect(() => {
    if (!quickQuery.q) return
    // reset
    setDistFilter(new Set())
    setStateFilter("")
    setMinSpend(0)
    setActiveOnly(false)
    setNoEmailOnly(false)
    onSearchChange("")
    setPage(0)
    if (quickQuery.q === "top") {
      setSortKey(SALON.spend)
      setSortDir(-1)
      setMinSpend(20000)
    } else if (quickQuery.q === "ca") {
      setStateFilter("CA")
      const wi = DISTRIBUTORS.findIndex((d) => d.short === "West Coast")
      if (wi >= 0) setDistFilter(new Set([wi]))
    } else if (quickQuery.q === "errors") {
      setNoEmailOnly(true)
      setSortKey(SALON.spend)
      setSortDir(-1)
      toast("Showing salons with no email on file")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickQuery.nonce])

  const filtered = useMemo(() => {
    let r: Salon[] = SALONS
    if (distFilter.size) r = r.filter((s) => distFilter.has(s[SALON.dist]))
    if (stateFilter) r = r.filter((s) => STATES[s[SALON.state]].abbr === stateFilter)
    if (minSpend > 0) r = r.filter((s) => s[SALON.spend] >= minSpend)
    if (activeOnly) r = r.filter(isActive)
    if (noEmailOnly) r = r.filter((s) => !emailFor(s))
    const q = search.trim().toLowerCase()
    if (q) {
      r = r.filter(
        (s) =>
          salonName(s).toLowerCase().includes(q) ||
          salonCity(s).toLowerCase().includes(q) ||
          STATES[s[SALON.state]].name.toLowerCase().includes(q) ||
          DISTRIBUTORS[s[SALON.dist]].short.toLowerCase().includes(q),
      )
    }
    return r
  }, [distFilter, stateFilter, minSpend, activeOnly, noEmailOnly, search])

  const stats = useMemo(() => {
    const n = filtered.length
    let sp = 0
    let av = 0
    let act = 0
    for (const s of filtered) {
      sp += s[SALON.spend]
      av += s[SALON.avg]
      if (isActive(s)) act += 1
    }
    return [
      { l: noEmailOnly ? "Records missing email" : "Matching salons", v: fmt(n) },
      { l: noEmailOnly ? "Blocked spend" : "Total lifetime spend", v: usdC(sp) },
      { l: "Avg lifetime spend", v: n ? usd(sp / n) : "$0" },
      { l: "Avg spend / month", v: n ? usd(av / n) : "$0" },
      { l: "Active members", v: n ? `${((act / n) * 100).toFixed(0)}%` : "0%" },
    ]
  }, [filtered, noEmailOnly])

  const sorted = useMemo(() => {
    const k = sortKey
    return filtered.slice().sort((a, b) => (a[k] - b[k]) * sortDir)
  }, [filtered, sortKey, sortDir])

  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const safePage = page >= pages ? 0 : page
  const start = safePage * PAGE
  const slice = sorted.slice(start, start + PAGE)

  function toggleDist(i: number) {
    setDistFilter((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
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
    onSearchChange("")
    setPage(0)
  }

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1))
    else {
      setSortKey(k)
      setSortDir(-1)
    }
  }

  function gotoPage(p: number) {
    setPage(p)
    tableTop.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

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
              {DISTRIBUTORS.map((d, i) => {
                const on = distFilter.has(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleDist(i)}
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
              onChange={(e) => {
                setStateFilter(e.target.value)
                setPage(0)
              }}
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
              onChange={(e) => {
                setMinSpend(+e.target.value)
                setPage(0)
              }}
              className="w-full accent-coral"
            />
            <div className="mt-1 text-[12px] text-muted">
              ≥ <b className="text-ink">{usd(minSpend)}</b>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
              Activity
            </label>
            <button
              onClick={() => {
                setActiveOnly((v) => !v)
                setPage(0)
              }}
              className="flex items-center gap-2.5 text-[13px] font-medium text-ink2"
            >
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
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
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((x) => (
          <div key={x.l} className="rounded-[12px] border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted">{x.l}</div>
            <div className="mt-1.5 font-display text-[20px] font-semibold tabular-nums text-ink">
              {x.v}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        ref={tableTop}
        className="overflow-hidden rounded-[14px] border border-line bg-card shadow-[var(--shadow)]"
      >
        <div className="flex items-center justify-between border-b border-line2 px-5 py-3.5 text-[13px]">
          <div className="text-muted">
            <b className="text-ink">{fmt(total)}</b> {noEmailOnly ? "records missing email" : "salons match"}
          </div>
          <div className="text-faint">
            {total ? `${start + 1}–${Math.min(start + PAGE, total)} shown` : ""}
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
              {slice.map((s, i) => {
                const act = isActive(s)
                const email = emailFor(s)
                return (
                  <tr key={start + i} onClick={() => setSelectedSalon(s)} className="cursor-pointer border-b border-line2/70 hover:bg-peach-soft">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{salonName(s)}</div>
                      <div className="text-[11.5px] text-faint">
                        {email || <span className="text-coral">no email on file</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {salonCity(s)}, {STATES[s[SALON.state]].abbr}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <i
                          className="size-2 rounded-full"
                          style={{ background: DISTRIBUTORS[s[SALON.dist]].color }}
                        />
                        {DISTRIBUTORS[s[SALON.dist]].short}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{usd(s[SALON.spend])}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink2">{usd(s[SALON.avg])}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink2">{fmt(s[SALON.points])}</td>
                    <td className="px-4 py-2.5 text-muted">{MONTHS[s[SALON.last]]}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          act ? "bg-gen-soft text-[#1f7256]" : "bg-miss-soft text-muted"
                        }`}
                      >
                        <i
                          className="size-1.5 rounded-full"
                          style={{ background: act ? "#2F9E78" : "#C8BBAE" }}
                        />
                        {act ? "Active" : "Dormant"}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-12 text-center text-muted">
                    No salons match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-line2 px-5 py-3 text-[13px]">
          <button
            disabled={safePage === 0}
            onClick={() => gotoPage(safePage - 1)}
            className="grid size-8 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper2 disabled:opacity-40"
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="text-muted">
            Page {safePage + 1} of {fmt(pages)}
          </span>
          <button
            disabled={safePage >= pages - 1}
            onClick={() => gotoPage(safePage + 1)}
            className="grid size-8 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper2 disabled:opacity-40"
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </div>
    </section>
    <SalonDetailPanel
      salon={selectedSalon}
      onClose={() => setSelectedSalon(null)}
    />
    </>
  )
}
