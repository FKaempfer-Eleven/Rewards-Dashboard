"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Loader2 } from "lucide-react"

import { Panel, PanelHeader, PageHeader } from "@/components/panel"
import { DISTRIBUTORS, fmt, usd, usdC } from "@/lib/data"

// ── Types ─────────────────────────────────────────────────────────────────────

type MapStats = {
  total: number
  totalSales: number
  states: Record<string, { count: number; sales: number }>
  distributors: Record<string, number>
}

// Compact point shape returned by /api/map-points
type MapPoint = {
  id: string
  n: string // salon name
  c: string | null // city
  st: string | null // state
  z: string | null // zip
  a: string | null // acct number
  d: number // distributor idx
  dc: string | null // distributor code
  v: number // lifetime sales
  act: boolean // is active
  lat: number
  lng: number
}

// ── Leaflet CDN loader (avoids bundling / SSR issues) ───────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
let leafletPromise: Promise<any> | null = null

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null)
  const w = window as any
  if (w.L && w.L.markerClusterGroup) return Promise.resolve(w.L)
  if (leafletPromise) return leafletPromise

  const addCss = (href: string) => {
    if (!document.querySelector(`link[data-lf="${href}"]`)) {
      const l = document.createElement("link")
      l.rel = "stylesheet"
      l.href = href
      l.setAttribute("data-lf", href)
      document.head.appendChild(l)
    }
  }
  const addScript = (src: string) =>
    new Promise<void>((res, rej) => {
      const existing = document.querySelector(`script[data-lf="${src}"]`) as any
      if (existing) {
        if (existing._loaded) res()
        else existing.addEventListener("load", () => res())
        return
      }
      const s = document.createElement("script") as any
      s.src = src
      s.async = true
      s.setAttribute("data-lf", src)
      s.addEventListener("load", () => { s._loaded = true; res() })
      s.addEventListener("error", () => rej(new Error("Failed to load " + src)))
      document.head.appendChild(s)
    })

  addCss("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css")
  addCss("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css")
  addCss("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css")

  leafletPromise = addScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js")
    .then(() => addScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"))
    .then(() => (window as any).L)
  return leafletPromise
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  )
}

// ── Main component ──────────────────────────────────────────────────────────────

export function SalonMapView() {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const clusterRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const [leafletReady, setLeafletReady] = useState(false)
  const [points, setPoints] = useState<MapPoint[]>([])
  const [mapStats, setMapStats] = useState<MapStats | null>(null)
  const [loadingPoints, setLoadingPoints] = useState(true)
  const [distToggle, setDistToggle] = useState<Set<number>>(new Set())
  const [excludeZeroSpend, setExcludeZeroSpend] = useState(false)
  const [selected, setSelected] = useState<MapPoint | null>(null)

  // Overview stats
  useEffect(() => {
    const qs = excludeZeroSpend ? "?excludeZeroSpend=true" : ""
    fetch(`/api/map-stats${qs}`).then((r) => r.json()).then(setMapStats).catch(console.error)
  }, [excludeZeroSpend])

  // Geocoded points
  useEffect(() => {
    setLoadingPoints(true)
    const qs = excludeZeroSpend ? "?excludeZeroSpend=true" : ""
    fetch(`/api/map-points${qs}`)
      .then((r) => r.json())
      .then((d) => setPoints(d.points ?? []))
      .catch(console.error)
      .finally(() => setLoadingPoints(false))
  }, [excludeZeroSpend])

  // Initialize Leaflet once
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !L || !mapEl.current || mapRef.current) return
        LRef.current = L
        const map = L.map(mapEl.current, {
          center: [44, -96],
          zoom: 4,
          scrollWheelZoom: true,
          worldCopyJump: true,
        })
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map)
        mapRef.current = map
        setTimeout(() => map.invalidateSize(), 200)
        setLeafletReady(true)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [])

  // (Re)build clustered markers whenever data / filters change
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map || !leafletReady) return

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }

    const list = distToggle.size > 0 ? points.filter((p) => distToggle.has(p.d)) : points
    const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 })

    for (const p of list) {
      const color = DISTRIBUTORS[p.d]?.color ?? "#888"
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.9,
      })
      const short = DISTRIBUTORS[p.d]?.short ?? p.dc ?? "—"
      marker.bindTooltip(
        `<b>${escapeHtml(p.n)}</b><br>${escapeHtml(short)} · ${usd(p.v)}`,
        { direction: "top", offset: [0, -4] }
      )
      marker.on("click", () => setSelected(p))
      cluster.addLayer(marker)
    }

    map.addLayer(cluster)
    clusterRef.current = cluster
  }, [points, distToggle, leafletReady])

  // Scroll the detail card into view when a salon is clicked
  useEffect(() => {
    if (selected) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      )
    }
  }, [selected])

  const distCountArr = useMemo(
    () => DISTRIBUTORS.map((d) => mapStats?.distributors[d.code] ?? 0),
    [mapStats]
  )
  const regions = useMemo(
    () => (mapStats ? Object.values(mapStats.states).filter((s) => s.count > 0).length : 0),
    [mapStats]
  )
  const topStates = useMemo(() => {
    if (!mapStats) return [] as [string, number][]
    return Object.entries(mapStats.states)
      .map(([abbr, s]) => [abbr, s.count] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [mapStats])

  return (
    <section>
      <PageHeader
        eyebrow="Geographic distribution"
        title="Salon Map"
        description="Every salon plotted at its real geocoded address on an OpenStreetMap base. Zoom in to see streets and individual locations; nearby salons group into clusters — click a cluster to expand, or a pin to see its details below."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left column — map + selected-salon detail directly beneath it */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Map card */}
          <div className="relative h-[560px] overflow-hidden rounded-[14px] border border-line bg-paper2 shadow-[var(--shadow)]">
            <div ref={mapEl} className="h-full w-full" style={{ background: "#eef3f6" }} />
            {(!leafletReady || loadingPoints) && (
              <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-paper2/60">
                <span className="flex items-center gap-2 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" />
                  {leafletReady ? "Loading salon locations…" : "Loading map…"}
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md bg-white/85 px-2 py-1 text-[11px] text-muted shadow">
              {fmt(points.length)} salons plotted
            </div>
          </div>

          {/* Selected-salon detail */}
          <div ref={detailRef}>
            {selected && (
              <SelectedSalonCard salon={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="North America" />
            <div className="p-5">
              <Stat k="Total salons" v={mapStats ? fmt(mapStats.total) : "—"} />
              <Stat k="States & provinces" v={String(regions)} />
              <Stat k="Lifetime sales" v={mapStats ? usdC(mapStats.totalSales) : "—"} />
              <Stat k="Plotted on map" v={fmt(points.length)} small />
              <div className="mt-3.5">
                <div className="mb-1 mt-3.5 text-[10.5px] font-bold uppercase tracking-[1px] text-muted">
                  Top regions
                </div>
                {topStates.map(([abbr, c]) => (
                  <div key={abbr} className="flex justify-between py-1.5 text-[12.5px] text-ink2">
                    <span>{abbr}</span>
                    <span className="tabular-nums text-muted">{fmt(c)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3.5 border-t border-line2 pt-3.5 text-[12px] leading-relaxed text-faint">
                Each pin is one salon at its geocoded street address, colored by servicing
                distributor. Canadian salons are geocoded separately and may appear as they are
                processed.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Filters" />
            <div className="border-b border-line2 px-4 py-3">
              <button
                onClick={() => setExcludeZeroSpend((v) => !v)}
                className="flex w-full items-center gap-2.5 text-[12.5px] font-medium text-ink2"
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
            <PanelHeader title="Distributors" hint="toggle" />
            <div className="flex flex-col gap-0.5 p-3">
              {DISTRIBUTORS.map((d, i) => {
                const off = distToggle.size > 0 && !distToggle.has(i)
                return (
                  <button
                    key={i}
                    onClick={() =>
                      setDistToggle((prev) => {
                        const next = new Set(prev)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    }
                    className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px] transition-colors hover:bg-paper2 ${
                      off ? "opacity-40" : ""
                    }`}
                  >
                    <i className="size-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-ink2">{d.short}</span>
                    <span className="ml-auto tabular-nums text-muted">{fmt(distCountArr[i])}</span>
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SelectedSalonCard({
  salon,
  onClose,
}: {
  salon: MapPoint
  onClose: () => void
}) {
  const dist = salon.d >= 0 ? DISTRIBUTORS[salon.d] : null
  const location = salon.c && salon.st ? `${salon.c}, ${salon.st}` : salon.c || salon.st || "—"

  return (
    <div className="rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">
      <div className="flex items-start justify-between border-b border-line2 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${
                salon.act ? "bg-gen-soft text-[#1f7256]" : "bg-miss-soft text-muted"
              }`}
            >
              <i
                className="size-1.5 rounded-full"
                style={{ background: salon.act ? "#2F9E78" : "#C8BBAE" }}
              />
              {salon.act ? "Active" : "Dormant"}
            </span>
            <span>{salon.a ?? "—"}</span>
          </div>
          <h3 className="mt-1.5 font-display text-[18px] font-semibold tracking-[0.2px] text-ink">
            {salon.n}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 flex-none items-center justify-center rounded-full border border-line text-faint transition-colors hover:border-coral hover:text-coral"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-4">
        <DetailItem label="Location" value={location} />
        <DetailItem label="Zip Code" value={salon.z || "—"} />
        <DetailItem
          label="Distributor"
          value={
            dist ? (
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-full" style={{ background: dist.color }} />
                {dist.short}
              </span>
            ) : (
              "—"
            )
          }
        />
        <DetailItem label="Lifetime spend" value={usd(salon.v)} />
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">
        {label}
      </div>
      <div className="text-[13.5px] font-medium text-ink">{value}</div>
    </div>
  )
}

function Stat({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line2 py-2.5 last:border-b-0">
      <span className="text-[12.5px] text-muted">{k}</span>
      <span
        className={`font-display font-semibold tabular-nums text-ink ${
          small ? "text-[13px]" : "text-[16px]"
        }`}
      >
        {v}
      </span>
    </div>
  )
}
