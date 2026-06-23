"use client"

import { useEffect } from "react"
import { AlertTriangle, X } from "lucide-react"

import { useToast } from "@/components/toast"
import {
  DISTRIBUTORS,
  FIELDS,
  MATRIX,
  MONTHS,
  SALON,
  SALONS,
  STATES,
  fmt,
  salonCity,
  salonName,
} from "@/lib/data"

export type ErrTarget = { di: number; mi: number }

export function ErrorModal({
  target,
  onClose,
}: {
  target: ErrTarget | null
  onClose: () => void
}) {
  const toast = useToast()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (target) {
      document.addEventListener("keydown", onKey)
      return () => document.removeEventListener("keydown", onKey)
    }
  }, [target, onClose])

  if (!target) return null

  const d = DISTRIBUTORS[target.di]
  const err = MATRIX[target.di][target.mi][1]
  const pool = SALONS.filter((s) => s[SALON.dist] === target.di).slice(0, 7)
  const e1 = Math.round(err * 0.46)
  const e2 = Math.round(err * 0.34)
  const e3 = Math.max(err - e1 - e2, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Generation blocked for ${d.name}`}
        className="flex max-h-[85dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-[16px] border border-line bg-card shadow-[var(--shadow-lg)]"
      >
        <div className="border-b border-line2 px-6 pb-5 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-coral-deep">
            <AlertTriangle className="size-3.5" strokeWidth={2.2} />
            Generation blocked · {MONTHS[target.mi]}
            <button
              onClick={onClose}
              aria-label="Close"
              className="ml-auto grid size-7 place-items-center rounded-full text-faint transition-colors hover:bg-line2 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <h3 className="mt-3 font-display text-[22px] font-semibold text-ink">{d.name}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            <b className="text-ink">{fmt(err)}</b> salon records can&apos;t generate points until
            missing data is supplied. The system has flagged exactly which fields are needed — no
            more manual chasing.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: e1, l: "Missing email" },
              { n: e2, l: "Missing address" },
              { n: e3, l: "Missing both" },
            ].map((x) => (
              <div key={x.l} className="rounded-[10px] border border-line bg-paper2 px-3 py-3 text-center">
                <div className="font-display text-[22px] font-semibold tabular-nums text-coral-deep">
                  {fmt(x.n)}
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted">{x.l}</div>
              </div>
            ))}
          </div>

          <table className="mt-4 w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line2 text-left font-display text-[11px] uppercase tracking-[1px] text-muted">
                <th className="pb-2 font-medium">Salon</th>
                <th className="pb-2 font-medium">Location</th>
                <th className="pb-2 font-medium">Needs</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((s, i) => (
                <tr key={i} className="border-b border-line2/70">
                  <td className="py-2.5 font-medium text-ink">{salonName(s)}</td>
                  <td className="py-2.5 text-muted">
                    {salonCity(s)}, {STATES[s[SALON.state]].abbr}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-block rounded-full bg-err-soft px-2.5 py-1 text-[11px] font-medium text-coral-deep">
                      {FIELDS[i % 3]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[12px] text-faint">
            Showing 7 of {fmt(err)} flagged records · full list exportable
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-line2 px-6 py-4">
          <button
            onClick={() => toast("Exception list downloaded (demo)")}
            className="rounded-full border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-paper2"
          >
            Download list
          </button>
          <button
            onClick={() => {
              toast(`Request sent to ${d.short} (demo)`)
              onClose()
            }}
            className="rounded-full bg-coral px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-coral-deep"
          >
            Request data from distributor
          </button>
        </div>
      </div>
    </div>
  )
}
