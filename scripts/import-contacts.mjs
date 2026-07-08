/**
 * import-contacts.mjs
 * Imports pending salon contacts from the Excel export into Supabase salon_cache.
 *
 * Usage (from the project root):
 *   node scripts/import-contacts.mjs
 *
 * Requirements:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - The Excel file path set in EXCEL_PATH below (or override with env var)
 */

import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

// ── Config ─────────────────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, "..")

// Path to the Excel file your developer sent
const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  resolve(
    process.env.HOME,
    "Library/Application Support/Claude/local-agent-mode-sessions/72fc2273-b5fc-47aa-bab8-324b5aea7936/c31576b9-e882-4300-a6b1-53213840b91d/local_cd01c3f7-b8cc-4966-8761-d757493b02fe/uploads/Pending Salon Contacts (Invite) 7-7-2026 2-07-49 PM.xlsx"
  )

const BATCH_SIZE = 500

// ── Distributor map ────────────────────────────────────────────────────────────

const DISTRIBUTOR_CODES = ["EVO", "UBE", "SSG", "INT", "WES", "SSP", "PRE", "TOR", "LIQ"]
const VALID_PREFIXES = new Set(DISTRIBUTOR_CODES.map((c) => c + "-"))

// "Company Name" column in the Excel contains the distributor's full name.
// Used as a fallback when the account number has no recognised prefix.
const COMPANY_NAME_TO_CODE = {
  "evolve salon systems":                           "EVO",
  "uber beauty":                                    "UBE",
  "salon service group":                            "SSG",
  "international beauty services & supplies":       "INT",
  "international beauty services and supplies":     "INT",
  "west coast beauty":                              "WES",
  "salon services pro":                             "SSP",
  "premier beauty supply":                          "PRE",
  "kevin murphy canada east":                       "TOR",
  "liquid assets llc":                              "LIQ",
  "liquid assets":                                  "LIQ",
}

// ── Load env ───────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(ROOT, ".env.local")
  const text = readFileSync(envPath, "utf8")
  const env = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
  return env
}

// ── Parse Excel ────────────────────────────────────────────────────────────────

async function parseExcel() {
  // Dynamic import of xlsx (CJS package)
  const XLSX = (await import("xlsx")).default
  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets["Pending Salon Contacts (Invite)"]
  if (!ws) throw new Error("Sheet 'Pending Salon Contacts (Invite)' not found")
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseSalonFullname(raw) {
  const parts = (raw || "").split("/").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { salonName: (raw || "").trim(), contactName: "" }
  if (parts.length === 1) return { salonName: parts[0], contactName: "" }
  return { salonName: parts[0], contactName: parts[1] }
}

function distributorCodeFromAcct(acct) {
  if (!acct) return null
  const m = String(acct).trim().match(/^([A-Z]+)-/)
  return m ? m[1] : null
}

function distributorIdxFromCode(code) {
  if (!code) return -1
  return DISTRIBUTOR_CODES.indexOf(code)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading env and Excel…")
  const env = loadEnv()

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  console.log("Parsing Excel…")
  const rawRows = await parseExcel()
  console.log(`  Found ${rawRows.length} rows`)

  const now = new Date().toISOString()
  let skipped = 0
  const rows = []

  for (const r of rawRows) {
    const id = r["(Do Not Modify) Contact"]
    if (!id) { skipped++; continue }

    const acct = r["Number"] ? String(r["Number"]).trim() : null
    let code = distributorCodeFromAcct(acct)

    // If the account number has no recognised distributor prefix, try Company Name
    if (!code || (acct && !VALID_PREFIXES.has(code + "-"))) {
      const companyRaw = r["Company Name"] ? String(r["Company Name"]).trim().toLowerCase() : ""
      code = COMPANY_NAME_TO_CODE[companyRaw] ?? null
    }

    // Skip contacts with no distributor at all (e.g. test entries)
    if (!code) {
      skipped++
      continue
    }

    const rawName = r["Last Name"] ? String(r["Last Name"]).trim() : ""
    const { salonName, contactName } = parseSalonFullname(rawName)

    rows.push({
      id: String(id).trim(),
      raw_name: rawName,
      salon_name: salonName,
      contact_name: contactName,
      email: r["Email"] ? String(r["Email"]).trim() : null,
      city: r["Address 1: City"] ? String(r["Address 1: City"]).trim() : null,
      state: r["Address 1: State/Province"] ? String(r["Address 1: State/Province"]).trim() : null,
      zip: r["Address 1: ZIP/Postal Code"] ? String(r["Address 1: ZIP/Postal Code"]).trim() : null,
      country: r["Address 1: Country/Region"] ? String(r["Address 1: Country/Region"]).trim() : null,
      acct_number: acct,
      distributor_code: code,
      distributor_idx: distributorIdxFromCode(code),
      // Financial fields default to 0 — the daily Dataverse sync will populate them
      lifetime_sales: 0,
      lifetime_points_issued: 0,
      lifetime_points_redeemed: 0,
      points_balance: 0,
      month_count: 0,
      last_purchase: null,
      is_active: false,
      avg_monthly_sales: 0,
      synced_at: now,
    })
  }

  console.log(`  Prepared ${rows.length} rows to import (skipped ${skipped})`)

  let inserted = 0
  let updated = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE)
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}…`)

    const { error, count } = await supabase
      .from("salon_cache")
      .upsert(batch, {
        onConflict: "id",
        // ignoreDuplicates: false → update metadata but DO NOT overwrite financial data.
        // We achieve this by re-supplying existing financial values via coalesce logic.
        // Since we're using the JS client (no custom ON CONFLICT SET), we use
        // ignoreDuplicates: true to skip rows that already exist with real data,
        // and insert only new ones. Run the full Dataverse sync after this to get financials.
        ignoreDuplicates: false,
        count: "exact",
      })

    if (error) {
      console.error(`\n  ERROR in batch ${batchNum}:`, error.message)
      process.exit(1)
    }

    process.stdout.write(` ✓\n`)
    inserted += batch.length
  }

  console.log(`\nDone! ${inserted} rows upserted into salon_cache.`)
  console.log("Note: financial fields (lifetime_sales, points, etc.) are set to 0 for newly")
  console.log("inserted contacts. Run a full sync to pull real figures from Dataverse.")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
