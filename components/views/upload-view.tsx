"use client"

import { useRef, useState } from "react"
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react"
import { PageHeader } from "@/components/panel"
import { DISTRIBUTORS, MONTHS } from "@/lib/data"

// ---- Types ----

type SalesRow = {
  salesman: string
  salonName: string
  accountNumber: string
  careSales: number
  colorSales: number
  totalSales: number
  period: string
  _issues: string[]
}

type NewSalonRow = {
  clientNumber: string
  salonName: string
  firstName: string
  lastName: string
  distributor: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  _issues: string[]
}

type UploadState<T> =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "done"; rows: T[]; fileName: string; warnings: number; detectedMonth: number }
  | { status: "processed"; rows: T[]; fileName: string; distIdx: number; monthIdx: number }
  | { status: "error"; message: string }

// ---- Excel parser ----

async function parseExcel(file: File): Promise<Record<string, unknown>[][]> {
  const XLSX = await import("xlsx")
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[]
  })
}

function normaliseKey(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function findCol(row: Record<string, unknown>, ...candidates: string[]): string {
  for (const c of candidates) {
    const norm = normaliseKey(c)
    for (const k of Object.keys(row)) {
      if (normaliseKey(k) === norm) return String(row[k] ?? "")
    }
  }
  return ""
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? 0 : n
}

function detectMonth(rows: Record<string, unknown>[]): number {
  for (const row of rows) {
    const period = findCol(row, "SALES PERIOD (PREVIOUS MONTH)", "salesperiod", "period", "month")
    if (period) {
      const idx = MONTHS.findIndex((m) => m.toLowerCase() === period.trim().toLowerCase().slice(0, 3))
      if (idx >= 0) return idx
    }
  }
  return MONTHS.length - 1 // fallback to most recent
}

function parseSalesRows(raw: Record<string, unknown>[]): SalesRow[] {
  return raw
    .filter((r) => findCol(r, "SALON NAME", "salonname", "salon"))
    .map((r) => {
      const acct = findCol(r, "INTERNAL ACCT#", "acct", "account", "clientnumber").trim()
      const totalSales = num(findCol(r, "TOTAL SALES", "totalsales", "total"))
      const issues: string[] = []
      if (!acct) issues.push("Missing account number")
      if (totalSales === 0) issues.push("Zero total sales")
      return {
        salesman: findCol(r, "Salesman", "salesperson", "rep"),
        salonName: findCol(r, "SALON NAME", "salonname", "salon"),
        accountNumber: acct,
        careSales: num(findCol(r, "CARE SALES", "caresales", "care")),
        colorSales: num(findCol(r, "COLOR SALES", "colorsales", "color")),
        totalSales,
        period: findCol(r, "SALES PERIOD (PREVIOUS MONTH)", "salesperiod", "period", "month"),
        _issues: issues,
      }
    })
}

function parseNewSalonRows(raw: Record<string, unknown>[]): NewSalonRow[] {
  return raw
    .filter((r) => findCol(r, "Salon Name", "salonname"))
    .map((r) => {
      const clientNum = findCol(r, "Client Number", "clientnumber", "clientno", "acct").trim()
      const email = findCol(r, "Salon Email", "email")
      const issues: string[] = []
      if (!email) issues.push("Missing email")
      if (!clientNum) issues.push("Missing client number")
      return {
        clientNumber: clientNum,
        salonName: findCol(r, "Salon Name", "salonname"),
        firstName: findCol(r, "First Name", "firstname"),
        lastName: findCol(r, "Last Name", "lastname"),
        distributor: findCol(r, "Distributor", "dist"),
        email,
        address: findCol(r, "Address: Street 1", "address", "street"),
        city: findCol(r, "City", "city"),
        state: findCol(r, "State", "state"),
        zip: findCol(r, "Zip", "zip", "postal"),
        phone: findCol(r, "Salon Phone#", "phone"),
        _issues: issues,
      }
    })
}

// ---- Shared drop zone ----

function DropZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed px-6 py-10 transition-colors ${
        dragging ? "border-coral bg-peach-soft" : "border-line bg-paper2 hover:border-coral/50 hover:bg-peach-soft/40"
      }`}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {loading ? (
        <div className="text-[13px] text-muted">Parsing file…</div>
      ) : (
        <>
          <div className="flex size-12 items-center justify-center rounded-full bg-peach-soft">
            <Upload className="size-5 text-coral" />
          </div>
          <div className="text-center">
            <div className="text-[13.5px] font-medium text-ink">Drop file here or click to browse</div>
            <div className="mt-0.5 text-[12px] text-muted">.xlsx, .xls, or .csv</div>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Confirmation modal ----

function ConfirmModal({
  rows,
  distIdx,
  monthIdx,
  fileName,
  warnings,
  onCancel,
  onConfirm,
}: {
  rows: SalesRow[]
  distIdx: number
  monthIdx: number
  fileName: string
  warnings: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-[2px]">
      <div className="w-full max-w-[460px] rounded-[18px] bg-white shadow-2xl">
        <div className="border-b border-line px-6 py-5">
          <div className="font-display text-[18px] font-semibold tracking-[0.3px] text-ink">
            Confirm upload
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            Review the details below before calculating points.
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <DetailRow label="File" value={fileName} />
          <DetailRow
            label="Distributor"
            value={
              <span className="flex items-center gap-2">
                <i className="size-2 rounded-full" style={{ background: DISTRIBUTORS[distIdx].color }} />
                {DISTRIBUTORS[distIdx].name}
              </span>
            }
          />
          <DetailRow label="Month" value={MONTHS[monthIdx]} />
          <DetailRow label="Salons to update" value={`${rows.length} salons`} />
          <DetailRow
            label="Total sales"
            value={"$" + Math.round(rows.reduce((a, r) => a + r.totalSales, 0)).toLocaleString("en-US")}
          />
          {warnings > 0 && (
            <div className="flex items-start gap-2 rounded-[10px] bg-[#fefce8] border border-[#fde68a] px-3.5 py-3 text-[12.5px] text-[#854d0e]">
              <AlertTriangle className="mt-0.5 size-4 flex-none" />
              <span>
                <b>{warnings} row{warnings !== 1 ? "s" : ""}</b> have warnings (missing account numbers or zero sales). These rows will be skipped.
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-line px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-line bg-paper2 py-2.5 text-[13px] font-medium text-muted transition-colors hover:border-coral hover:text-coral"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-coral py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-coral-deep"
          >
            <Check className="size-3.5" />
            Confirm + Calculate Points
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-paper2 px-4 py-2.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.4px] text-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink">{value}</span>
    </div>
  )
}

// ---- Distributor selector ----

function DistributorSelector({
  value,
  onChange,
}: {
  value: number | null
  onChange: (i: number) => void
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">
        Which distributor is this file from?
      </label>
      <div className="flex flex-wrap gap-1.5">
        {DISTRIBUTORS.map((d, i) => {
          const on = value === i
          return (
            <button
              key={i}
              onClick={() => onChange(i)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                on ? "border-ink bg-ink text-white" : "border-line bg-paper2 text-ink2 hover:border-faint"
              }`}
            >
              <i className="size-2 rounded-full" style={{ background: d.color }} />
              {d.short}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- Sales upload section ----

function SalesUpload({ onUploadComplete }: { onUploadComplete: (di: number, mi: number) => void }) {
  const [state, setState] = useState<UploadState<SalesRow>>({ status: "idle" })
  const [expanded, setExpanded] = useState(true)
  const [distIdx, setDistIdx] = useState<number | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleFile(file: File) {
    if (distIdx === null) return
    setState({ status: "parsing" })
    try {
      const sheets = await parseExcel(file)
      const rows = parseSalesRows(sheets[0] as Record<string, unknown>[])
      const warnings = rows.filter((r) => r._issues.length > 0).length
      const detectedMonth = detectMonth(sheets[0] as Record<string, unknown>[])
      setState({ status: "done", rows, fileName: file.name, warnings, detectedMonth })
      setShowConfirm(true)
    } catch {
      setState({ status: "error", message: "Could not parse file. Make sure it's a valid .xlsx or .csv." })
    }
  }

  function handleConfirm() {
    if (state.status !== "done") return
    const mi = state.detectedMonth
    onUploadComplete(distIdx!, mi)
    setState({ status: "processed", rows: state.rows, fileName: state.fileName, distIdx: distIdx!, monthIdx: mi })
    setShowConfirm(false)
  }

  function reset() {
    setState({ status: "idle" })
    setShowConfirm(false)
  }

  const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US")

  return (
    <>
      <div className="rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">
        <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-peach-soft">
              <FileSpreadsheet className="size-4 text-coral" />
            </div>
            <div className="text-left">
              <div className="font-display text-[14px] font-semibold uppercase tracking-[0.5px] text-ink">Monthly Sales File</div>
              <div className="text-[12px] text-muted">Calculate points for existing salon members</div>
            </div>
          </div>
          {expanded ? <ChevronUp className="size-4 text-faint" /> : <ChevronDown className="size-4 text-faint" />}
        </button>

        {expanded && (
          <div className="border-t border-line px-5 pb-5 pt-4">
            <div className="mb-4 rounded-[10px] bg-paper2 px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Expected columns</div>
              <div className="flex flex-wrap gap-1.5">
                {["Salesman", "Salon Name", "Internal Acct#", "Care Sales", "Color Sales", "Total Sales", "Sales Period"].map((col) => (
                  <span key={col} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-ink2">{col}</span>
                ))}
              </div>
            </div>

            {(state.status === "idle" || state.status === "parsing" || state.status === "error") && (
              <>
                <DistributorSelector value={distIdx} onChange={setDistIdx} />

                {distIdx === null ? (
                  <div className="flex items-center justify-center rounded-[12px] border-2 border-dashed border-line bg-paper2 px-6 py-10 text-[13px] text-faint">
                    Select a distributor above to enable upload
                  </div>
                ) : (
                  <DropZone onFile={handleFile} loading={state.status === "parsing"} />
                )}

                {state.status === "error" && (
                  <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-err-soft bg-err-soft px-4 py-3 text-[13px] text-[#c9483b]">
                    <AlertTriangle className="size-4 flex-none" />
                    {state.message}
                    <button onClick={reset} className="ml-auto"><X className="size-4" /></button>
                  </div>
                )}
              </>
            )}

            {state.status === "processed" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-[10px] bg-gen-soft px-4 py-3 text-[13px] text-[#1f7256]">
                  <CheckCircle className="size-4 flex-none" />
                  <span>
                    Points calculated for <b>{state.rows.length} salons</b> · {DISTRIBUTORS[state.distIdx].short} · {MONTHS[state.monthIdx]}
                  </span>
                  <button onClick={reset} className="ml-auto text-[#2f9e78] hover:text-[#1f7256]"><X className="size-4" /></button>
                </div>

                <div className="overflow-hidden rounded-[10px] border border-line">
                  <div className="max-h-[280px] overflow-auto">
                    <table className="w-full border-collapse text-[12.5px]">
                      <thead className="sticky top-0 bg-paper2">
                        <tr>
                          {["Salon Name", "Acct #", "Care Sales", "Color Sales", "Total Sales", "Issues"].map((h) => (
                            <th key={h} className="border-b border-line px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {state.rows.map((row, i) => (
                          <tr key={i} className={`border-b border-line2 ${row._issues.length > 0 ? "bg-[#fefce8]" : ""}`}>
                            <td className="px-3 py-2 font-medium text-ink">{row.salonName}</td>
                            <td className="px-3 py-2 font-mono text-ink2">{row.accountNumber || <span className="text-coral">—</span>}</td>
                            <td className="px-3 py-2 tabular-nums text-ink2">{row.careSales ? usd(row.careSales) : "—"}</td>
                            <td className="px-3 py-2 tabular-nums text-ink2">{row.colorSales ? usd(row.colorSales) : "—"}</td>
                            <td className="px-3 py-2 tabular-nums font-medium text-ink">{usd(row.totalSales)}</td>
                            <td className="px-3 py-2">
                              {row._issues.length > 0
                                ? <span className="flex items-center gap-1 text-[11px] text-[#854d0e]"><AlertTriangle className="size-3 flex-none" />{row._issues.join(", ")}</span>
                                : <span className="text-[11px] text-gen">✓ OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirm && state.status === "done" && (
        <ConfirmModal
          rows={state.rows}
          distIdx={distIdx!}
          monthIdx={state.detectedMonth}
          fileName={state.fileName}
          warnings={state.warnings}
          onCancel={() => { setShowConfirm(false); setState({ status: "idle" }) }}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}

// ---- New salons upload section ----

function NewSalonsUpload() {
  const [state, setState] = useState<UploadState<NewSalonRow>>({ status: "idle" })
  const [expanded, setExpanded] = useState(true)

  async function handleFile(file: File) {
    setState({ status: "parsing" })
    try {
      const sheets = await parseExcel(file)
      const rows = parseNewSalonRows(sheets[0] as Record<string, unknown>[])
      const warnings = rows.filter((r) => r._issues.length > 0).length
      setState({ status: "done", rows, fileName: file.name, warnings, detectedMonth: 0 })
    } catch {
      setState({ status: "error", message: "Could not parse file. Make sure it's a valid .xlsx or .csv." })
    }
  }

  function reset() { setState({ status: "idle" }) }
  function process() {
    if (state.status !== "done") return
    setState({ status: "processed", rows: state.rows, fileName: state.fileName, distIdx: 0, monthIdx: 0 })
  }

  return (
    <div className="rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-gen-soft">
            <FileSpreadsheet className="size-4 text-gen" />
          </div>
          <div className="text-left">
            <div className="font-display text-[14px] font-semibold uppercase tracking-[0.5px] text-ink">New Salons Enrollment File</div>
            <div className="text-[12px] text-muted">Enroll newly qualified salons into the rewards program</div>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-faint" /> : <ChevronDown className="size-4 text-faint" />}
      </button>

      {expanded && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          <div className="mb-4 rounded-[10px] bg-paper2 px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Expected columns</div>
            <div className="flex flex-wrap gap-1.5">
              {["Client Number", "Salon Name", "First Name", "Last Name", "Distributor", "Salon Email", "Address", "City", "State", "Zip", "Salon Phone#"].map((col) => (
                <span key={col} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-ink2">{col}</span>
              ))}
            </div>
          </div>

          {state.status === "idle" && <DropZone onFile={handleFile} loading={false} />}
          {state.status === "parsing" && <DropZone onFile={handleFile} loading={true} />}

          {state.status === "error" && (
            <div className="flex items-center gap-2 rounded-[10px] border border-err-soft bg-err-soft px-4 py-3 text-[13px] text-[#c9483b]">
              <AlertTriangle className="size-4 flex-none" />
              {state.message}
              <button onClick={reset} className="ml-auto"><X className="size-4" /></button>
            </div>
          )}

          {(state.status === "done" || state.status === "processed") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px]">
                  <FileSpreadsheet className="size-4 text-muted" />
                  <span className="font-medium text-ink">{state.fileName}</span>
                  <span className="text-muted">· {state.rows.length} new salons</span>
                  {state.status === "done" && state.warnings > 0 && (
                    <span className="flex items-center gap-1 text-[#854d0e]">
                      <AlertTriangle className="size-3.5" />{state.warnings} warning{state.warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {state.status === "processed" && (
                    <span className="flex items-center gap-1 text-gen"><CheckCircle className="size-3.5" />Enrolled</span>
                  )}
                </div>
                <button onClick={reset} className="text-faint hover:text-coral"><X className="size-4" /></button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "New salons", value: String(state.rows.length) },
                  { label: "Missing email", value: String(state.rows.filter((r) => !r.email).length) },
                  { label: "Warnings", value: String(state.rows.filter((r) => r._issues.length > 0).length) },
                ].map((s) => (
                  <div key={s.label} className="rounded-[10px] border border-line bg-paper2 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted">{s.label}</div>
                    <div className="mt-0.5 font-display text-[18px] font-semibold tabular-nums text-ink">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[10px] border border-line">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead className="sticky top-0 bg-paper2">
                      <tr>
                        {["Client #", "Salon Name", "Contact", "Distributor", "Email", "Location", "Issues"].map((h) => (
                          <th key={h} className="border-b border-line px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row, i) => (
                        <tr key={i} className={`border-b border-line2 ${row._issues.length > 0 ? "bg-[#fefce8]" : ""}`}>
                          <td className="px-3 py-2 font-mono text-ink2">{row.clientNumber || <span className="text-coral">—</span>}</td>
                          <td className="px-3 py-2 font-medium text-ink">{row.salonName}</td>
                          <td className="px-3 py-2 text-muted">{[row.firstName, row.lastName].filter(Boolean).join(" ")}</td>
                          <td className="px-3 py-2 text-muted">{row.distributor}</td>
                          <td className="px-3 py-2 text-ink2">{row.email || <span className="text-coral text-[11px]">no email</span>}</td>
                          <td className="px-3 py-2 text-muted whitespace-nowrap">{[row.city, row.state].filter(Boolean).join(", ")}</td>
                          <td className="px-3 py-2">
                            {row._issues.length > 0
                              ? <span className="flex items-center gap-1 text-[11px] text-[#854d0e]"><AlertTriangle className="size-3 flex-none" />{row._issues.join(", ")}</span>
                              : <span className="text-[11px] text-gen">✓ OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {state.status === "done" && (
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-[10px] border border-line bg-paper2 px-4 py-2 text-[13px] font-medium text-muted hover:border-coral hover:text-coral">Cancel</button>
                  <button onClick={process} className="rounded-[10px] bg-gen px-5 py-2 text-[13px] font-medium text-white hover:bg-[#27855f]">
                    Enroll {state.rows.length} new salons →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Main view ----

export function UploadView({ onCellUploaded }: { onCellUploaded: (di: number, mi: number) => void }) {
  return (
    <section>
      <PageHeader
        eyebrow="Distributor data · Monthly"
        title="Upload Monthly Purchases"
        description="Upload the monthly sales file from each distributor to calculate points, and enroll newly qualified salons into the rewards program."
      />
      <div className="space-y-5">
        <SalesUpload onUploadComplete={onCellUploaded} />
        <NewSalonsUpload />
      </div>
    </section>
  )
}
