"use client"

import { useEffect, useRef, useState } from "react"

import { DISTRIBUTORS, TIMESERIES, distSpend, usdC } from "@/lib/data"

export function TimeseriesChart() {
  const ts = TIMESERIES
  const W = 520
  const H = 210
  const pl = 10
  const pr = 10
  const pt = 14
  const pb = 26
  const iw = W - pl - pr
  const ih = H - pt - pb
  const max = Math.max(...ts.map((t) => t[1])) * 1.08
  const xx = (i: number) => pl + (ts.length <= 1 ? 0 : i * (iw / (ts.length - 1)))
  const yy = (v: number) => pt + ih - (v / max) * ih
  const line = (arr: number[]) =>
    arr.map((v, i) => `${i ? "L" : "M"}${xx(i).toFixed(1)},${yy(v).toFixed(1)}`).join("")
  const issued = ts.map((t) => t[1])
  const redeemed = ts.map((t) => t[2])
  const area = `${line(issued)}L${xx(ts.length - 1)},${pt + ih}L${xx(0)},${pt + ih}Z`

  const grid: number[] = [0, 1, 2, 3]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full">
        <defs>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#E8654F" stopOpacity="0.28" />
            <stop offset="1" stopColor="#E8654F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => {
          const y = pt + (ih / 3) * g
          return <line key={g} x1={pl} y1={y} x2={W - pr} y2={y} stroke="#efe6dc" />
        })}
        <path d={area} fill="url(#areaGrad)" />
        <path d={line(issued)} fill="none" stroke="#E8654F" strokeWidth={2.4} strokeLinejoin="round" />
        <path d={line(redeemed)} fill="none" stroke="#5B8DB8" strokeWidth={2} strokeDasharray="4 3" />
        {redeemed.map((v, i) => (
          <circle key={i} cx={xx(i)} cy={yy(v)} r={2.6} fill="#5B8DB8" />
        ))}
        {ts.map((t, i) =>
          i % 2 === 0 || i === ts.length - 1 ? (
            <text
              key={i}
              x={xx(i)}
              y={H - 8}
              fontSize={9.5}
              fill="#a99c90"
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
            >
              {t[0]}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1.5 flex gap-[18px] text-[12px] text-muted">
        <span className="flex items-center gap-2">
          <i className="inline-block h-[3px] w-3.5 rounded-sm bg-coral" />
          Issued
        </span>
        <span className="flex items-center gap-2">
          <i className="inline-block h-0 w-3.5 border-t-2 border-dashed border-blue" />
          Redeemed
        </span>
      </div>
    </div>
  )
}

export function DistributorBars() {
  const order = DISTRIBUTORS.map((d, i) => ({ d, i, v: distSpend[i] })).sort(
    (a, b) => b.v - a.v,
  )
  const max = Math.max(...order.map((o) => o.v))
  const [mounted, setMounted] = useState(false)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    raf.current = requestAnimationFrame(() => setMounted(true))
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {order.map((o) => (
        <div key={o.i} className="flex items-center gap-3">
          <div className="w-[88px] flex-none truncate text-[12.5px] text-ink2" title={o.d.name}>
            {o.d.short}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line2">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: mounted ? `${((o.v / max) * 100).toFixed(1)}%` : "0%",
                background: o.d.color,
              }}
            />
          </div>
          <div className="w-[52px] flex-none text-right text-[12.5px] font-medium tabular-nums text-ink">
            {usdC(o.v)}
          </div>
        </div>
      ))}
    </div>
  )
}
