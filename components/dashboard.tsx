"use client"

import { useCallback, useRef, useState } from "react"
import { LayoutGrid, Users, Map as MapIcon, Search, Upload } from "lucide-react"

import { ToastProvider } from "@/components/toast"
import { OverviewView } from "@/components/views/overview-view"
import { SalonExplorerView } from "@/components/views/salon-explorer-view"
import { SalonMapView } from "@/components/views/salon-map-view"
import { UploadView } from "@/components/views/upload-view"

export type ViewKey = "overview" | "salons" | "map" | "upload"
export type QuickQuery = "errors" | "top" | "ca" | null

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Overview",
  salons: "Salon Explorer",
  map: "Salon Map",
  upload: "Upload",
}

const NAV: { key: ViewKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "salons", label: "Salon Explorer", icon: Users },
  { key: "map", label: "Salon Map", icon: MapIcon },
  { key: "upload", label: "Upload monthly purchases", icon: Upload },
]

export function Dashboard() {
  const [view, setView] = useState<ViewKey>("overview")
  const [search, setSearch] = useState("")
  // bump a counter to signal the explorer to apply a quick query
  const [quickQuery, setQuickQuery] = useState<{ q: QuickQuery; nonce: number }>({
    q: null,
    nonce: 0,
  })
  const searchRef = useRef<HTMLInputElement>(null)

  const runQuickQuery = useCallback((q: QuickQuery) => {
    setQuickQuery((prev) => ({ q, nonce: prev.nonce + 1 }))
    setView("salons")
  }, [])

  const goSearch = useCallback(() => {
    setView("salons")
    setTimeout(() => searchRef.current?.focus(), 60)
  }, [])

  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden bg-paper text-ink">
        {/* ---- Sidebar rail ---- */}
        <aside className="flex w-[236px] flex-none flex-col bg-ink px-3.5 pb-4 pt-5 text-[#ede6df]">
          <div className="px-2">
            <div className="font-display text-[25px] font-semibold leading-none tracking-[7px]">
              ELEVEN<span className="text-coral">.</span>
            </div>
            <small className="mt-2 block pl-0.5 font-display text-[9.5px] font-normal tracking-[5.5px] text-faint">
              REWARDS OPS
            </small>
          </div>

          <div className="px-3 pb-2 pt-5 font-display text-[10px] uppercase tracking-[2px] text-[#6f655c]">
            Operations
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon
              const on = view === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-current={on ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
                    on
                      ? "bg-coral text-white"
                      : "text-[#c9bfb6] hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="px-3 pb-2 pt-3.5 font-display text-[10px] uppercase tracking-[2px] text-[#6f655c]">
            Data
          </div>
          <nav className="flex flex-col gap-0.5">
            <button
              onClick={goSearch}
              className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium text-[#c9bfb6] transition-colors hover:bg-white/[0.06]"
            >
              <Search className="size-[18px]" strokeWidth={1.8} />
              Query the data
            </button>
          </nav>

          <div className="mt-auto rounded-[10px] bg-white/[0.04] p-3 text-[11.5px] leading-relaxed text-[#9a8f85]">
            <span className="mr-1.5 inline-block size-[7px] rounded-full bg-gen shadow-[0_0_0_3px_rgba(47,158,120,0.2)]" />
            <b className="text-[#ede6df]">Dataverse</b> connected
            <br />
            Last sync · today, 9:42 AM
          </div>
        </aside>

        {/* ---- Main ---- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[66px] flex-none items-center gap-[18px] border-b border-line bg-paper2 px-[26px]">
            <div className="font-display text-[11px] uppercase tracking-[1.5px] text-faint">
              REWARDS PORTAL / <b className="text-ink">{VIEW_LABELS[view]}</b>
            </div>
            <div className="relative ml-auto w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 size-[18px] text-faint" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (e.target.value) setView("salons")
                }}
                placeholder="Search salons, distributors, cities…"
                className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-[13.5px] text-ink outline-none transition-shadow placeholder:text-faint focus:border-coral focus:shadow-[0_0_0_3px_var(--peach-soft)]"
              />
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap text-[12px] text-muted">
              <span className="size-2 rounded-full bg-gen shadow-[0_0_0_3px_rgba(47,158,120,0.18)]" />
              Live · Dataverse
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[26px]">
            {view === "overview" && (
              <OverviewView onQuickQuery={runQuickQuery} />
            )}
            {view === "salons" && (
              <SalonExplorerView
                search={search}
                onSearchChange={setSearch}
                quickQuery={quickQuery}
              />
            )}
            {view === "map" && <SalonMapView />}
            {view === "upload" && <UploadView />}
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}
