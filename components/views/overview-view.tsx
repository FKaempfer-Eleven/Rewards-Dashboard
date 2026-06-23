"use client"

import { useState } from "react"
import { AlertTriangle, MapPin, TrendingUp } from "lucide-react"

import { Panel, PanelHeader, PageHeader } from "@/components/panel"
import { TimeseriesChart, DistributorBars } from "@/components/charts"
import { ErrorModal, type ErrTarget } from "@/components/error-modal"
import type { QuickQuery } from "@/components/dashboard"
import {
  DISTRIBUTORS,
  MATRIX,
  MONTHS,
  SALONS,
  TIMESERIES,
  curErrors,
  fmt,
  totalSpend,
  usdC,
} from "@/lib/data"

const STATUS_CLASS: Record<number, string> = {
  2: "bg-gen-soft text-[#1f7256]",
  1: "bg-proc-soft text-[#9a6a12]",
  3: "bg-err-soft text-coral-deep border border-[#f3c4b8] cursor-pointer hover:-translate-y-px hover:bg-[#f7cdbf] hover:shadow-[var(--shadow)]",
  0: "bg-miss-soft text-faint",
}

export function OverviewView({
  onQuickQuery,
}: {
  onQuickQuery: (q: QuickQuery) => void
}) {
  const [curMonth, setCurMonth] = useState(MONTHS.length - 1)
  const [errTarget, setErrTarget] = useState<ErrTarget | null>(null)

  const ts = TIMESERIES[curMonth]
  const er = curErrors(curMonth)

  const kpis = [
    { l: "Salon members", v: fmt(SALONS.length), s: "enrolled in rewards" },
    { l: "Active distributors", v: String(DISTRIBUTORS.length), s: "uploading sales data" },
    { l: `Points issued · ${MONTHS[curMonth]}`, v: fmt(ts[1]), s: "this period" },
    {
      l: `Points redeemed · ${MONTHS[curMonth]}`,
      v: fmt(ts[2]),
      s: `${((ts[2] / ts[1]) * 100).toFixed(0)}% of issued`,
    },
    { l: "Lifetime sales tracked", v: usdC(totalSpend), s: "across all salons" },
    {
      l: "Records blocking points",
      v: fmt(er.e),
      s: `across ${er.d} distributor files`,
      alert: true,
    },
  ]

  const months4 = MONTHS.slice(-4).map((m, i) => ({ m, idx: MONTHS.length - 4 + i }))

  return (
    <section>
      <PageHeader
        eyebrow="North America · Salon Rewards"
        title="Operations Overview"
        description="Every salon dollar spent through a distributor earns reward points. Track generation status, spot the records blocking points, and query the whole program from one place."
      >
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-white p-1">
          {months4.map(({ m, idx }) => (
            <button
              key={idx}
              onClick={() => setCurMonth(idx)}
              className={`rounded-full px-3.5 py-[7px] text-[12px] font-semibold tabular-nums transition-colors ${
                idx === curMonth ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.l}
            className={`relative overflow-hidden rounded-[14px] border px-4 pb-[15px] pt-4 shadow-[var(--shadow)] ${
              k.alert
                ? "border-peach bg-gradient-to-b from-white to-[#fff6f3]"
                : "border-line bg-card"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2px] text-muted">
              {k.alert && <AlertTriangle className="size-3.5 text-coral" strokeWidth={2.2} />}
              {k.l}
            </div>
            <div
              className={`mt-2.5 font-display text-[29px] font-semibold leading-[1.05] tracking-[0.3px] tabular-nums ${
                k.alert ? "text-coral-deep" : "text-ink"
              }`}
            >
              {k.v}
            </div>
            <div className="mt-1 text-[11.5px] text-faint">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Quick queries */}
      <div className="mb-[22px] flex flex-wrap gap-2.5">
        {[
          { q: "errors" as const, icon: AlertTriangle, label: "Salons missing email or address" },
          { q: "top" as const, icon: TrendingUp, label: "Top spenders this program" },
          { q: "ca" as const, icon: MapPin, label: "California salons by West Coast Beauty" },
        ].map(({ q, icon: Icon, label }) => (
          <button
            key={q}
            onClick={() => onQuickQuery(q)}
            className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink2 transition-colors hover:border-coral hover:text-coral-deep"
          >
            <Icon className="size-4 text-coral" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* Generation matrix */}
      <Panel className="mb-5">
        <PanelHeader
          title="Monthly Point Generation"
          hint={
            <>
              Click any <b className="text-coral-deep">flagged</b> cell to see what&apos;s blocking
              points
            </>
          }
        />
        <div className="flex flex-wrap gap-4 px-5 pb-1 pt-3.5 text-[12px] text-muted">
          <LegendItem className="bg-gen-soft border-[#bfe0d2]" label="Points generated" />
          <LegendItem className="bg-proc-soft border-[#e8d4a6]" label="Processing" />
          <LegendItem className="bg-err-soft border-[#f3c4b8]" label="Errors — data missing" />
          <LegendItem className="bg-miss-soft border-line" label="Not uploaded" />
        </div>
        <div className="overflow-x-auto px-5 pb-5 pt-1.5">
          <table className="w-full border-separate border-spacing-[3px]">
            <thead>
              <tr>
                <th className="pb-3 pl-1 text-left font-display text-[11px] font-medium uppercase tracking-[1px] text-muted">
                  Distributor
                </th>
                {MONTHS.map((m, i) => (
                  <th
                    key={m}
                    className={`px-1 pb-3 text-center font-display text-[11px] font-medium uppercase tracking-[1px] tabular-nums ${
                      i === curMonth ? "text-coral" : "text-muted"
                    }`}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DISTRIBUTORS.map((d, di) => (
                <tr key={di}>
                  <td className="whitespace-nowrap py-0.5 pr-3 text-[12.5px] font-medium text-ink">
                    <span className="flex items-center gap-2">
                      <i className="size-2 rounded-[3px]" style={{ background: d.color }} />
                      {d.short}
                    </span>
                  </td>
                  {MATRIX[di].map((cell, mi) => {
                    const [st, err] = cell
                    return (
                      <td key={mi} className="p-0">
                        <button
                          type="button"
                          disabled={st !== 3}
                          onClick={() => st === 3 && setErrTarget({ di, mi })}
                          title={`${d.short} · ${MONTHS[mi]} · ${
                            st === 2
                              ? "Generated"
                              : st === 3
                                ? `${err} records missing data`
                                : st === 1
                                  ? "Processing"
                                  : "Not uploaded"
                          }`}
                          className={`flex h-8 w-full min-w-[34px] items-center justify-center rounded-[7px] text-[11px] font-semibold tabular-nums transition-all ${STATUS_CLASS[st]} ${
                            mi === curMonth ? "ring-1 ring-coral/40" : ""
                          }`}
                        >
                          {st === 2 ? (
                            <CheckIcon />
                          ) : st === 3 ? (
                            fmt(err)
                          ) : st === 1 ? (
                            "•••"
                          ) : (
                            ""
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Points issued vs redeemed" hint="Rolling 12 months" />
          <div className="p-5">
            <TimeseriesChart />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Sales by distributor" hint="Lifetime, tracked" />
          <div className="p-5">
            <DistributorBars />
          </div>
        </Panel>
      </div>

      <ErrorModal target={errTarget} onClose={() => setErrTarget(null)} />
    </section>
  )
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className={`inline-block size-3.5 rounded-[4px] border ${className}`} />
      {label}
    </span>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-3.5">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}
