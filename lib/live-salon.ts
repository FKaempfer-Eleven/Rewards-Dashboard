// Types and helpers for real Dataverse salon data.
// Replaces the compact mock Salon tuple for API-driven screens.

import { DISTRIBUTORS } from "./data"

// ── Type ──────────────────────────────────────────────────────────────────────

export type LiveSalon = {
  id: string              // contact.contactid GUID
  rawName: string         // contact.fullname as stored ("Salon/Contact/State")
  salonName: string       // parsed: first "/" segment
  contactName: string     // parsed: second "/" segment (person at the salon)
  email: string | null
  city: string | null
  state: string | null    // 2-letter abbr, trimmed
  zip: string | null
  country: string | null
  acctnumber: string | null     // e.g. "EVO-12712"
  distributorCode: string | null // "EVO" | "UBE" | …
  distributorIdx: number         // index in DISTRIBUTORS; -1 if unknown
  lifetimeSales: number
  lifetimePointsIssued: number   // care points + color points
  lifetimePointsRedeemed: number
  pointsBalance: number          // remaining / unredeemed points
  monthCount: number             // number of monthly upload records
  lastPurchase: string | null    // ISO date "2026-05-01T00:00:00"
  isActive: boolean              // last purchase within last 12 months
  avgMonthlySales: number        // lifetimeSales / monthCount
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

export function parseSalonFullname(raw: string): { salonName: string; contactName: string } {
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { salonName: raw.trim(), contactName: "" }
  if (parts.length === 1) return { salonName: parts[0], contactName: "" }
  return { salonName: parts[0], contactName: parts[1] }
}

export function distributorCodeFromAcct(acct: string | null): string | null {
  if (!acct) return null
  const m = acct.trim().match(/^([A-Z]+)-/)
  return m ? m[1] : null
}

export function distributorIdxFromCode(code: string | null): number {
  if (!code) return -1
  return DISTRIBUTORS.findIndex((d) => d.code === code)
}

export function isSalonActive(lastPurchase: string | null): boolean {
  if (!lastPurchase) return false
  const last = new Date(lastPurchase)
  const now = new Date()
  const months =
    (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth())
  return months <= 12
}

/** Last purchase ISO date → short label e.g. "May '26" */
export function lastPurchaseLabel(lastPurchase: string | null): string {
  if (!lastPurchase) return "—"
  const d = new Date(lastPurchase)
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" })
}

/**
 * Map a raw Dataverse FetchXML aggregate row to a LiveSalon.
 * Handles both bare aliases (aggregate queries) and
 * entity-prefixed aliases (linked-entity queries).
 */
export function mapRowToLiveSalon(row: Record<string, unknown>): LiveSalon {
  // FetchXML aggregate responses use the alias directly.
  // Non-aggregate linked-entity responses prefix with "{alias}_{field}".
  const g = (key: string) => row[key] ?? row[`h_${key}`] ?? null

  const rawName = String(row["rawName"] ?? "")
  const { salonName, contactName } = parseSalonFullname(rawName)

  const acctnumber = String(g("acctnumber") ?? "").trim() || null
  const code = distributorCodeFromAcct(acctnumber)
  const idx = distributorIdxFromCode(code)

  const carePts = Number(g("carePts") ?? 0)
  const colorPts = Number(g("colorPts") ?? 0)
  const lifetimeSales = Number(g("lifetimeSales") ?? 0)
  const redeemed = Number(g("redeemed") ?? 0)
  const balance = Number(g("pointsBalance") ?? 0)
  const monthCount = Number(g("monthCount") ?? 0)
  const lastPurchase = (g("lastPurchase") as string | null) || null

  return {
    id: String(row["id"] ?? ""),
    rawName,
    salonName,
    contactName,
    email: (row["email"] as string | null) || null,
    city: ((row["city"] as string) || "").trim() || null,
    state: ((row["state"] as string) || "").trim() || null,
    zip: ((row["zip"] as string) || "").trim() || null,
    country: ((row["country"] as string) || "").trim() || null,
    acctnumber,
    distributorCode: code,
    distributorIdx: idx,
    lifetimeSales,
    lifetimePointsIssued: carePts + colorPts,
    lifetimePointsRedeemed: redeemed,
    pointsBalance: balance,
    monthCount,
    lastPurchase,
    isActive: isSalonActive(lastPurchase),
    avgMonthlySales: monthCount > 0 ? lifetimeSales / monthCount : 0,
  }
}
