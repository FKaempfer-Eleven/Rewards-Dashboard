"use client"

import { useMemo, useState } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps"
import { Minus, Plus, RotateCcw, ChevronLeft } from "lucide-react"

import { Panel, PanelHeader, PageHeader } from "@/components/panel"
import { US_TOPO, CANADA_TOPO } from "@/lib/geo"
import {
  DISTRIBUTORS,
  SALON,
  SALONS,
  STATES,
  type Salon,
  distCount,
  fmt,
  salonCity,
  salonName,
  stateCount,
  stateDist,
  totalSpend,
  usd,
  usdC,
} from "@/lib/data"

const DEFAULT_CENTER: [number, number] = [-96, 47]
const DEFAULT_ZOOM = 1

function colorScale(c: number, max: number) {
  const t = Math.min(1, c / max)
  const a = [251, 228, 218]
  const b = [200, 72, 59]
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

export function SalonMapView() {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [activeState, setActiveState] = useState<number | null>(null)
  const [distToggle, setDistToggle] = useState<Set<number>>(new Set())
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null)

  const maxCount = useMemo(() => Math.max(...stateCount), [])

  function enterState(si: number) {
    const st = STATES[si]
    setActiveState(si)
    setCenter([st.lon, st.lat])
    setZoom(st.abbr === "CA" || st.abbr === "TX" ? 4 : 6)
  }

  function exitState() {
    setActiveState(null)
    setCenter(DEFAULT_CENTER)
    setZoom(DEFAULT_ZOOM)
  }

  function zoomBy(factor: number) {
    setZoom((z) => Math.max(1, Math.min(18, z * factor)))
  }

  const pins = useMemo<Salon[]>(() => {
    if (activeState === null) return []
    let list = SALONS.filter((s) => s[SALON.state] === activeState)
    if (distToggle.size) list = list.filter((s) => distToggle.has(s[SALON.dist]))
    if (list.length > 900) {
      const step = list.length / 900
      const out: Salon[] = []
      for (let k = 0; k < list.length; k += step) out.push(list[Math.floor(k)])
      list = out
    }
    return list
  }, [activeState, distToggle])

  const pinR = Math.max(1.2, Math.min(4, 5 / zoom))
  const bubbleScale = (c: number) => Math.max(7, Math.sqrt(c) * 1.6)

  return (
    <section>
      <PageHeader
        eyebrow="Geographic distribution"
        title="Salon Map"
        description="Bubbles show salon counts by state and province across the U.S. and Canada. Click one to drop into individual salon pins — use + / − to zoom further."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Map card */}
        <div className="relative h-[560px] overflow-hidden rounded-[14px] border border-line bg-paper2 shadow-[var(--shadow)]">
          {activeState !== null && (
            <button
              onClick={exitState}
              className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink shadow-[var(--shadow)] transition-colors hover:bg-paper2"
            >
              <ChevronLeft className="size-4" />
              Back to map
            </button>
          )}
          <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
            <MapBtn onClick={() => zoomBy(1.5)} label="Zoom in">
              <Plus className="size-4" />
            </MapBtn>
            <MapBtn onClick={() => zoomBy(0.66)} label="Zoom out">
              <Minus className="size-4" />
            </MapBtn>
            <MapBtn onClick={exitState} label="Reset view">
              <RotateCcw className="size-3.5" />
            </MapBtn>
          </div>

          {tip && (
            <div
              className="pointer-events-none absolute z-30 max-w-[200px] rounded-lg bg-ink px-3 py-2 text-[12px] leading-snug text-[#ede6df] shadow-[var(--shadow-lg)]"
              style={{ left: tip.x + 14, top: tip.y + 14 }}
              dangerouslySetInnerHTML={{ __html: tip.html }}
            />
          )}

          <div
            className="h-full w-full"
            onMouseLeave={() => setTip(null)}
            onMouseMove={(e) => {
              if (!tip) return
              const rect = e.currentTarget.getBoundingClientRect()
              setTip((t) => (t ? { ...t, x: e.clientX - rect.left, y: e.clientY - rect.top } : t))
            }}
          >
            <ComposableMap
              projection="geoAlbers"
              projectionConfig={{
                rotate: [96, 0, 0],
                center: [-0.6, 39],
                parallels: [29.5, 45.5],
                scale: 850,
              }}
              width={800}
              height={560}
              style={{ width: "100%", height: "100%" }}
            >
              <ZoomableGroup
                center={center}
                zoom={zoom}
                minZoom={1}
                maxZoom={18}
                onMoveEnd={({ coordinates, zoom: z }) => {
                  setCenter(coordinates as [number, number])
                  setZoom(z)
                }}
              >
                {/* Canada backdrop */}
                <Geographies geography={CANADA_TOPO}>
                  {({ geographies }) =>
                    geographies
                      .filter((g) => g.properties.name === "Canada")
                      .map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          style={{
                            default: { fill: "#efe6dc", stroke: "#e0d3c5", strokeWidth: 0.4, outline: "none" },
                            hover: { fill: "#efe6dc", outline: "none" },
                            pressed: { fill: "#efe6dc", outline: "none" },
                          }}
                        />
                      ))
                  }
                </Geographies>

                {/* US states */}
                <Geographies geography={US_TOPO}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const si = STATES.findIndex((s) => s.name === geo.properties.name)
                      const count = si >= 0 ? stateCount[si] : 0
                      const dim = activeState !== null && si !== activeState
                      const sel = activeState !== null && si === activeState
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onClick={() => si >= 0 && enterState(si)}
                          onMouseEnter={() =>
                            si >= 0 &&
                            setTip({
                              x: 0,
                              y: 0,
                              html: `<b>${STATES[si].name}</b><br><span style="color:#a99c90">${fmt(count)} salons · click to zoom</span>`,
                            })
                          }
                          style={{
                            default: {
                              fill: si >= 0 ? colorScale(count, maxCount) : "#efe6dc",
                              stroke: "#ffffff",
                              strokeWidth: 0.5,
                              outline: "none",
                              opacity: dim ? 0.35 : 1,
                              cursor: si >= 0 ? "pointer" : "default",
                              transition: "opacity .3s",
                            },
                            hover: {
                              fill: si >= 0 ? "#e8654f" : "#efe6dc",
                              stroke: "#ffffff",
                              strokeWidth: sel ? 1 : 0.5,
                              outline: "none",
                              opacity: dim ? 0.35 : 1,
                              cursor: si >= 0 ? "pointer" : "default",
                            },
                            pressed: { fill: "#c9483b", outline: "none" },
                          }}
                        />
                      )
                    })
                  }
                </Geographies>

                {/* Bubbles (overview) */}
                {activeState === null &&
                  STATES.map((s, si) => {
                    const c = stateCount[si]
                    if (!c) return null
                    const r = bubbleScale(c) / zoom
                    return (
                      <Marker
                        key={s.abbr}
                        coordinates={[s.lon, s.lat]}
                        onClick={() => enterState(si)}
                        onMouseEnter={() =>
                          setTip({
                            x: 0,
                            y: 0,
                            html: `<b>${s.name}</b><br><span style="color:#a99c90">${fmt(c)} salons</span>`,
                          })
                        }
                        onMouseLeave={() => setTip(null)}
                        style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" } }}
                      >
                        <circle
                          r={r}
                          fill="rgba(28,26,25,0.78)"
                          stroke="#fff"
                          strokeWidth={0.6}
                        />
                        <text
                          textAnchor="middle"
                          y={3 / zoom}
                          style={{
                            fontFamily: "var(--font-oswald), sans-serif",
                            fontSize: `${Math.max(7, 10 / zoom)}px`,
                            fill: "#fff",
                            fontWeight: 600,
                          }}
                        >
                          {c}
                        </text>
                      </Marker>
                    )
                  })}

                {/* Pins (state detail) */}
                {pins.map((s, i) => (
                  <Marker
                    key={i}
                    coordinates={[s[SALON.lon], s[SALON.lat]]}
                    onMouseEnter={() =>
                      setTip({
                        x: 0,
                        y: 0,
                        html: `<b>${salonName(s)} · ${salonCity(s)}</b><br><span style="color:#a99c90">${DISTRIBUTORS[s[SALON.dist]].short} · ${usd(s[SALON.spend])} lifetime</span>`,
                      })
                    }
                    onMouseLeave={() => setTip(null)}
                  >
                    <circle
                      r={pinR}
                      fill={DISTRIBUTORS[s[SALON.dist]].color}
                      stroke="#fff"
                      strokeWidth={0.4}
                      fillOpacity={0.9}
                    />
                  </Marker>
                ))}
              </ZoomableGroup>
            </ComposableMap>
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title={activeState === null ? "North America" : STATES[activeState].name} />
            <div className="p-5">
              <SidePanel activeState={activeState} />
            </div>
          </Panel>

          <Panel>
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
                    <span className="ml-auto tabular-nums text-muted">{fmt(distCount[i])}</span>
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

function MapBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border border-line bg-white text-ink shadow-[var(--shadow)] transition-colors hover:bg-paper2"
    >
      {children}
    </button>
  )
}

function SidePanel({ activeState }: { activeState: number | null }) {
  if (activeState === null) {
    const topStates = STATES.map((s, k) => ({ s, c: stateCount[k] }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 6)
    const regions = STATES.filter((_, k) => stateCount[k] > 0).length
    return (
      <div>
        <Stat k="Total salons" v={fmt(SALONS.length)} />
        <Stat k="States & provinces" v={String(regions)} />
        <Stat k="Lifetime sales" v={usdC(totalSpend)} />
        <SideList title="Top regions" rows={topStates.map((t) => [t.s.name, fmt(t.c)])} />
        <p className="mt-3.5 border-t border-line2 pt-3.5 text-[12px] leading-relaxed text-faint">
          Tip — click a state to see its salons. Each pin is one salon, colored by its servicing
          distributor.
        </p>
      </div>
    )
  }

  const list = SALONS.filter((s) => s[SALON.state] === activeState)
  let sp = 0
  for (const s of list) sp += s[SALON.spend]
  const db = stateDist[activeState]
    .map((c, di) => ({ c, di }))
    .filter((o) => o.c > 0)
    .sort((a, b) => b.c - a.c)
  const cm: Record<string, number> = {}
  for (const s of list) {
    const cn = salonCity(s)
    cm[cn] = (cm[cn] || 0) + 1
  }
  const topCities = Object.entries(cm)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  return (
    <div>
      <Stat k={`Salons in ${STATES[activeState].abbr}`} v={fmt(list.length)} />
      <Stat k="Lifetime sales" v={usdC(sp)} />
      <Stat k="Top distributor" v={db.length ? DISTRIBUTORS[db[0].di].short : "—"} small />
      <SideList title="Top cities" rows={topCities.map(([c, n]) => [c, fmt(n)])} />
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

function SideList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="mt-1.5">
      <div className="mb-1 mt-3.5 text-[10.5px] font-bold uppercase tracking-[1px] text-muted">
        {title}
      </div>
      {rows.map(([a, b]) => (
        <div key={a} className="flex justify-between py-1.5 text-[12.5px] text-ink2">
          <span>{a}</span>
          <span className="tabular-nums text-muted">{b}</span>
        </div>
      ))}
    </div>
  )
}
