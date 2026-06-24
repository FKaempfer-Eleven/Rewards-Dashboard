"use client"

import { useRef, useState } from "react"
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react"
import { PageHeader } from "@/components/panel"
import { SALONS, SALON, accountNumber } from "@/lib/data"

// Build a lookup of known account numbers for validation
const KNOWN_ACCOUNTS = new Set(SALONS.map((s) => accountNumber(s).replace("EA-", "")))

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
  | { status: "done"; rows: T[]; fileName: string; warnings: number }
  | { status: "processed"; rows: T[]; fileName: string }
  | { status: "error"; message: string }

// ---- Excel parser (uses SheetJS loaded dynamically) ----

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

// ---- Parsers ----

function parseSalesRows(raw: Record<string, unknown>[]): SalesRow[] {
  return raw
    .filter((r) => findCol(r, "SALON NAME", "salonname", "salon"))
    .map((r) => {
      const acct = findCol(r, "INTERNAL ACCT#", "acct", "account", "clientnumber", "accountnumber").trim()
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

// ---- Upload card ----

function DropZone({
  onFile,
  loading,
}: {
  onFile: (f: File) => void
  loading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed px-6 py-10 transition-colors ${
        dragging
          ? "border-coral bg-peach-soft"
          : "border-line bg-paper2 hover:border-coral/50 hover:bg-peach-soft/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
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

// ---- Sales upload section ----

function SalesUpload() {
  const [state, setState] = useState<UploadState<SalesRow>>({ status: "idle" })
  const [expanded, setExpanded] = useState(true)

  async function handleFile(file: File) {
    setState({ status: "parsing" })
    try {
      const sheets = await parseExcel(file)
      const rows = parseSalesRows(sheets[0] as Record<string, unknown>[])
      const warnings = rows.filter((r) => r._issues.length > 0).length
      setState({ status: "done", rows, fileName: file.name, warnings })
    } catch {
      setState({ status: "error", message: "Could not parse file. Make sure it's a valid .xlsx or .csv." })
    }
  }

  function reset() { setState({ status: "idle" }) }
  function process() {
    if (state.status !== "done") return
    setState({ status: "processed", rows: state.rows, fileName: state.fileName })
  }

  const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US")

  return (
    <div className="rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-peach-soft">
            <FileSpreadsheet className="size-4 text-coral" />
          </div>
          <div className="text-left">
            <div className="font-display text-[14px] font-semibold uppercase tracking-[0.5px] text-ink">
              Monthly Sales File
            </div>
            <div className="text-[12px] text-muted">Calculate points for existing salon members</div>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-faint" /> : <ChevronDown className="size-4 text-faint" />}
      </button>

      {expanded && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {/* Expected format */}
          <div className="mb-4 rounded-[10px] bg-paper2 px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Expected columns</div>
            <div className="flex flex-wrap gap-1.5">
              {["Salesman", "Salon Name", "Internal Acct#", "Care Sales", "Color Sales", "Total Sales", "Sales Period"].map((col) => (
                <span key={col} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-ink2">
                  {col}
                </span>
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
                  <span className="text-muted">· {state.rows.length} rows</span>
                  {state.status === "done" && state.warnings > 0 && (
                    <span className="flex items-center gap-1 text-[#b07c18]">
                      <AlertTriangle className="size-3.5" />
                      {state.warnings} warning{state.warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {state.status === "processed" && (
                    <span className="flex items-center gap-1 text-gen">
                      <CheckCircle className="size-3.5" />
                      Processed
                    </span>
                  )}
                </div>
                <button onClick={reset} className="text-faint hover:text-coral"><X className="size-4" /></button>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Salons", value: String(state.rows.length) },
                  { label: "Total sales", value: usd(state.rows.reduce((a, r) => a + r.totalSales, 0)) },
                  { label: "Warnings", value: String(state.rows.filter((r) => r._issues.length > 0).length) },
                ].map((s) => (
                  <div key={s.label} className="rounded-[10px] border border-line bg-paper2 px-3 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted">{s.label}</div>
                    <div className="mt-0.5 font-display text-[18px] font-semibold tabular-nums text-ink">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Table preview */}
              <div className="overflow-hidden rounded-[10px] border border-line">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead className="sticky top-0 bg-paper2">
                      <tr>
                        {["Salon Name", "Acct #", "Salesman", "Care Sales", "Color Sales", "Total Sales", "Period", "Issues"].map((h) => (
                          <th key={h} className="border-b border-line px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row, i) => (
                        <tr key={i} className={`border-b border-line2 ${row._issues.length > 0 ? "bg-proc-soft/30" : ""}`}>
                          <td className="px-3 py-2 font-medium text-ink">{row.salonName}</td>
                          <td className="px-3 py-2 font-mono text-ink2">{row.accountNumber || <span className="text-coral">—</span>}</td>
                          <td className="px-3 py-2 text-muted">{row.salesman}</td>
                          <td className="px-3 py-2 tabular-nums text-ink2">{row.careSales ? usd(row.careSales) : "—"}</td>
                          <td className="px-3 py-2 tabular-nums text-ink2">{row.colorSales ? usd(row.colorSales) : "—"}</td>
                          <td className="px-3 py-2 tabular-nums font-medium text-ink">{usd(row.totalSales)}</td>
                          <td className="px-3 py-2 text-muted">{row.period}</td>
                          <td className="px-3 py-2">
                            {row._issues.length > 0 ? (
                              <span className="flex items-center gap-1 text-[11px] text-[#b07c18]">
                                <AlertTriangle className="size-3 flex-none" />
                                {row._issues.join(", ")}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gen">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {state.status === "done" && (
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-[10px] border border-line bg-paper2 px-4 py-2 text-[13px] font-medium text-muted hover:border-coral hover:text-coral">
                    Cancel
                  </button>
                  <button onClick={process} className="rounded-[10px] bg-coral px-5 py-2 text-[13px] font-medium text-white hover:bg-coral-deep">
                    Calculate points for {state.rows.length} salons →
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
      setState({ status: "done", rows, fileName: file.name, warnings })
    } catch {
      setState({ status: "error", message: "Could not parse file. Make sure it's a valid .xlsx or .csv." })
    }
  }

  function reset() { setState({ status: "idle" }) }
  function process() {
    if (state.status !== "done") return
    setState({ status: "processed", rows: state.rows, fileName: state.fileName })
  }

  return (
    <div className="rounded-[14px] border border-line bg-card shadow-[var(--shadow)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-gen-soft">
            <FileSpreadsheet className="size-4 text-gen" />
          </div>
          <div className="text-left">
            <div className="font-display text-[14px] font-semibold uppercase tracking-[0.5px] text-ink">
              New Salons Enrollment File
            </div>
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
                <span key={col} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[11.5px] text-ink2">
                  {col}
                </span>
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
                    <span className="flex items-center gap-1 text-[#b07c18]">
                      <AlertTriangle className="size-3.5" />
                      {state.warnings} warning{state.warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {state.status === "processed" && (
                    <span className="flex items-center gap-1 text-gen">
                      <CheckCircle className="size-3.5" />
                      Enrolled
                    </span>
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
                        <tr key={i} className={`border-b border-line2 ${row._issues.length > 0 ? "bg-proc-soft/30" : ""}`}>
                          <td className="px-3 py-2 font-mono text-ink2">{row.clientNumber || <span className="text-coral">—</span>}</td>
                          <td className="px-3 py-2 font-medium text-ink">{row.salonName}</td>
                          <td className="px-3 py-2 text-muted">{[row.firstName, row.lastName].filter(Boolean).join(" ")}</td>
                          <td className="px-3 py-2 text-muted">{row.distributor}</td>
                          <td className="px-3 py-2 text-ink2">{row.email || <span className="text-coral text-[11px]">no email</span>}</td>
                          <td className="px-3 py-2 text-muted whitespace-nowrap">{[row.city, row.state].filter(Boolean).join(", ")}</td>
                          <td className="px-3 py-2">
                            {row._issues.length > 0 ? (
                              <span className="flex items-center gap-1 text-[11px] text-[#b07c18]">
                                <AlertTriangle className="size-3 flex-none" />
                                {row._issues.join(", ")}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gen">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {state.status === "done" && (
                <div className="flex justify-end gap-2">
                  <button onClick={reset} className="rounded-[10px] border border-line bg-paper2 px-4 py-2 text-[13px] font-medium text-muted hover:border-coral hover:text-coral">
                    Cancel
                  </button>
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

export function UploadView() {
  return (
    <section>
      <PageHeader
        eyebrow="Distributor data · Monthly"
        title="Upload Monthly Purchases"
        description="Upload the monthly sales file from each distributor to calculate points, and enroll newly qualified salons into the rewards program."
      />
      <div className="space-y-5">
        <SalesUpload />
        <NewSalonsUpload />
      </div>
    </section>
  )
}
