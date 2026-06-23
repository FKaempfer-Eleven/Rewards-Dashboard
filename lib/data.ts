// Deterministic mock data for the Eleven Australia Rewards Ops Dashboard.
// Mirrors the structure of the original prototype: distributors, North American
// states/provinces, a salon member base, a monthly point-generation matrix and
// a rolling points issued/redeemed timeseries.

import { STATE_GEO, type StateGeo } from "./geo"

export type Distributor = {
  name: string
  short: string
  color: string
}

export type StateInfo = {
  name: string
  abbr: string
  /** longitude/latitude centroid for bubbles + pins */
  lon: number
  lat: number
}

// Salon stored as a compact tuple to keep the dataset light.
// [distIdx, stateIdx, lon, lat, spend, points, avgMo, lastMonth, cityIdx, seed]
export type Salon = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export const SALON = {
  dist: 0,
  state: 1,
  lon: 2,
  lat: 3,
  spend: 4,
  points: 5,
  avg: 6,
  last: 7,
  city: 8,
  seed: 9,
} as const

// ---- mulberry32 deterministic PRNG ----
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const DISTRIBUTORS: Distributor[] = [
  { name: "West Coast Beauty Supply", short: "West Coast", color: "#E8654F" },
  { name: "Salon Centric National", short: "SalonCentric", color: "#2F9E78" },
  { name: "Maly's Professional", short: "Maly's", color: "#5B8DB8" },
  { name: "Armstrong McCall", short: "Armstrong", color: "#D89A2E" },
  { name: "Cosmo Prof Group", short: "Cosmo Prof", color: "#9B6FB0" },
  { name: "Beauty Systems Co.", short: "Beauty Sys", color: "#C9483B" },
  { name: "Northern Salon Trade", short: "Northern", color: "#3F8E8C" },
]

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

// State info derived from geo data (lon/lat centroids).
export const STATES: StateInfo[] = STATE_GEO.map((g: StateGeo) => ({
  name: g.name,
  abbr: g.abbr,
  lon: g.lon,
  lat: g.lat,
}))

export const STATE_INDEX: Record<string, number> = {}
STATES.forEach((s, i) => {
  STATE_INDEX[s.abbr] = i
})

// Relative salon weight per state (population-ish heuristic, higher = more salons)
const STATE_WEIGHT: Record<string, number> = {
  CA: 34,
  TX: 24,
  FL: 22,
  NY: 20,
  PA: 13,
  IL: 13,
  OH: 12,
  GA: 11,
  NC: 11,
  MI: 10,
  NJ: 9,
  VA: 9,
  WA: 9,
  AZ: 9,
  MA: 8,
  TN: 8,
  IN: 7,
  MO: 7,
  MD: 7,
  WI: 7,
  CO: 7,
  MN: 7,
  SC: 6,
  AL: 6,
  LA: 5,
  KY: 5,
  OR: 5,
  OK: 5,
  CT: 4,
  UT: 4,
  IA: 4,
  NV: 4,
  AR: 4,
  MS: 3,
  KS: 3,
  NM: 3,
  NE: 3,
  ID: 3,
  WV: 2,
  NH: 2,
  ME: 2,
  RI: 2,
  MT: 2,
  DE: 2,
  SD: 2,
  ND: 2,
  AK: 2,
  VT: 1,
  WY: 1,
  HI: 2,
  // Canada
  ON: 18,
  QC: 12,
  BC: 9,
  AB: 8,
  MB: 3,
  SK: 3,
  NS: 2,
  NB: 2,
  NL: 1,
  PE: 1,
}

export const CITIES: Record<string, string[]> = {
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento", "Fresno", "Long Beach", "Oakland"],
  TX: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington"],
  FL: ["Jacksonville", "Miami", "Tampa", "Orlando", "St. Petersburg", "Hialeah"],
  NY: ["New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading"],
  IL: ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
  GA: ["Atlanta", "Augusta", "Savannah", "Athens", "Macon"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
  MI: ["Detroit", "Grand Rapids", "Ann Arbor", "Lansing", "Flint"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Scottsdale", "Chandler"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell"],
  ON: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
  QC: ["Montreal", "Quebec City", "Laval", "Gatineau", "Sherbrooke"],
  BC: ["Vancouver", "Victoria", "Surrey", "Burnaby", "Kelowna"],
  AB: ["Calgary", "Edmonton", "Red Deer", "Lethbridge"],
}

const PREFIX = [
  "Bloom",
  "Lush",
  "Halo",
  "Mane",
  "Gloss",
  "Ivy",
  "Luxe",
  "Verde",
  "Crown",
  "Mirror",
  "Sable",
  "Velvet",
  "Coastal",
  "Urban",
  "Wild",
  "Studio",
]
const SUFFIX = [
  "Salon",
  "Hair Co.",
  "Beauty Bar",
  "Studio",
  "& Co.",
  "Collective",
  "Lounge",
  "Hair Lab",
  "Atelier",
  "Room",
]

function cityList(abbr: string, fallback: string): string[] {
  return CITIES[abbr] ?? [fallback]
}

export function salonName(s: Salon): string {
  const st = STATES[s[SALON.state]]
  const cs = cityList(st.abbr, st.name)
  const city = cs[s[SALON.city]] ?? cs[0]
  const sd = s[SALON.seed]
  const p = PREFIX[sd % PREFIX.length]
  const suf = SUFFIX[(sd >> 3) % SUFFIX.length]
  const m = sd % 4
  if (m === 1) return `${city} ${suf}`
  if (m === 2) return `${p} ${city}`
  return `${p} ${suf}`
}

export function salonCity(s: Salon): string {
  const st = STATES[s[SALON.state]]
  const cs = cityList(st.abbr, st.name)
  return cs[s[SALON.city]] ?? cs[0]
}

export function emailFor(s: Salon): string {
  const sd = s[SALON.seed]
  if (sd % 7 === 0) return "" // ~14% missing email
  const slug = salonName(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16)
  const dom = ["gmail.com", "salonmail.com", "hotmail.com", "outlook.com"][sd % 4]
  return `${slug}@${dom}`
}

export function isActive(s: Salon): boolean {
  return s[SALON.last] >= 6
}

// ---- generate salons ----
function generateSalons(): Salon[] {
  const rand = rng(20240617)
  const salons: Salon[] = []
  let seed = 1

  STATES.forEach((st, si) => {
    const geo = STATE_GEO[si]
    const weight = STATE_WEIGHT[st.abbr] ?? 1
    const count = Math.max(3, Math.round(weight * 4 + rand() * weight))
    const cs = cityList(st.abbr, st.name)

    for (let k = 0; k < count; k++) {
      // distributor weighted by region (use lon to bias)
      let di: number
      const r = rand()
      if (st.abbr === "CA" || st.abbr === "WA" || st.abbr === "OR" || st.abbr === "NV") {
        di = r < 0.55 ? 0 : Math.floor(rand() * DISTRIBUTORS.length)
      } else if (["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE"].includes(st.abbr)) {
        di = r < 0.6 ? 6 : Math.floor(rand() * DISTRIBUTORS.length)
      } else {
        di = Math.floor(rand() * DISTRIBUTORS.length)
      }

      // jitter lon/lat around centroid
      const lon = geo.lon + (rand() - 0.5) * geo.spread * 2
      const lat = geo.lat + (rand() - 0.5) * geo.spread

      const avg = Math.round(300 + rand() * rand() * 4200)
      const months = 3 + Math.floor(rand() * 40)
      const spend = avg * months + Math.round(rand() * 2000)
      const points = Math.round(spend * (0.8 + rand() * 0.5))
      const last = Math.floor(Math.pow(rand(), 0.6) * 12) // skew toward recent
      const cityIdx = Math.floor(rand() * cs.length)

      salons.push([di, si, lon, lat, spend, points, avg, last, cityIdx, seed])
      seed += 1
    }
  })

  return salons
}

export const SALONS: Salon[] = generateSalons()

// ---- aggregates ----
export const distSpend = DISTRIBUTORS.map(() => 0)
export const distCount = DISTRIBUTORS.map(() => 0)
export const stateCount = STATES.map(() => 0)
export const stateDist = STATES.map(() => DISTRIBUTORS.map(() => 0))
export let totalSpend = 0
export let totalPoints = 0

for (const s of SALONS) {
  distSpend[s[SALON.dist]] += s[SALON.spend]
  distCount[s[SALON.dist]] += 1
  stateCount[s[SALON.state]] += 1
  stateDist[s[SALON.state]][s[SALON.dist]] += 1
  totalSpend += s[SALON.spend]
  totalPoints += s[SALON.points]
}

// ---- generation matrix ----
// status: 2 = generated, 1 = processing, 3 = error, 0 = not uploaded
// cell = [status, errorCount]
export type MatrixCell = [number, number]

function generateMatrix(): MatrixCell[][] {
  const rand = rng(99887766)
  return DISTRIBUTORS.map((_, di) => {
    return MONTHS.map((_, mi) => {
      const r = rand()
      // most recent two months more likely processing / error
      const recent = mi >= MONTHS.length - 2
      if (recent && r < 0.22) return [1, 0] as MatrixCell // processing
      if (r < 0.16) {
        const err = 40 + Math.floor(rand() * 900) + di * 30
        return [3, err] as MatrixCell // error
      }
      if (r < 0.08) return [0, 0] as MatrixCell // not uploaded
      return [2, 0] as MatrixCell // generated
    })
  })
}

export const MATRIX: MatrixCell[][] = generateMatrix()

export function curErrors(mi: number) {
  let e = 0
  let d = 0
  MATRIX.forEach((row) => {
    if (row[mi][0] === 3) {
      e += row[mi][1]
      d += 1
    }
  })
  return { e, d }
}

// ---- timeseries: [monthLabel, issued, redeemed] rolling 12 months ----
export type TimePoint = [string, number, number]

function generateTimeseries(): TimePoint[] {
  const rand = rng(424242)
  const out: TimePoint[] = []
  let base = Math.round(totalPoints / 26)
  for (let i = 0; i < 12; i++) {
    base = Math.round(base * (1 + (rand() - 0.35) * 0.12))
    const issued = base + Math.round(rand() * base * 0.2)
    const redeemed = Math.round(issued * (0.42 + rand() * 0.22))
    out.push([MONTHS[i], issued, redeemed])
  }
  return out
}

export const TIMESERIES: TimePoint[] = generateTimeseries()

export const FIELDS = ["Email", "Address", "Email + Address"]

// formatting helpers
export const fmt = (n: number) => n.toLocaleString("en-US")
export const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US")
export const usdC = (n: number) =>
  n >= 1e6
    ? "$" + (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? "$" + (n / 1e3).toFixed(0) + "K"
      : "$" + n

// ---- Salon detail helpers ----

export function accountNumber(s: Salon): string {
  return "EA-" + String(s[SALON.seed] + 100000).padStart(6, "0")
}

export function username(s: Salon): string {
  const email = emailFor(s)
  if (email) return email.split("@")[0]
  return salonName(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16)
}

export type MonthlyHistory = {
  month: string
  purchases: number
  pointsEarned: number
}

export function salonMonthlyHistory(s: Salon): MonthlyHistory[] {
  const rand = rng(s[SALON.seed] * 137 + 9)
  return MONTHS.map((month, mi) => {
    // salons have activity in roughly half the months; skew toward recent
    const hasActivity = rand() > 0.35 || mi >= s[SALON.last] - 2
    if (!hasActivity) return { month, purchases: 0, pointsEarned: 0 }
    const purchases = Math.round(s[SALON.avg] * (0.6 + rand() * 0.9))
    const pointsEarned = Math.round(purchases * (0.85 + rand() * 0.3))
    return { month, purchases, pointsEarned }
  })
}

export type Order = {
  id: string
  date: string
  amount: number
  pointsRedeemed: number
  items: number
  status: "Completed" | "Refunded" | "Pending"
}

export function salonOrders(s: Salon): Order[] {
  const rand = rng(s[SALON.seed] * 251 + 7)
  const count = 3 + Math.floor(rand() * 10)
  const orders: Order[] = []
  const year = 2024
  for (let i = 0; i < count; i++) {
    const month = Math.floor(rand() * 12)
    const day = 1 + Math.floor(rand() * 28)
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const amount = Math.round(s[SALON.avg] * (0.4 + rand() * 1.1))
    const redeemed = rand() > 0.55 ? Math.round(amount * (0.1 + rand() * 0.4) * 10) : 0
    const statusR = rand()
    const status: Order["status"] = statusR < 0.07 ? "Refunded" : statusR < 0.12 ? "Pending" : "Completed"
    orders.push({
      id: `ORD-${String(s[SALON.seed] * 13 + i + 1000).slice(-5)}`,
      date: dateStr,
      amount,
      pointsRedeemed: redeemed,
      items: 1 + Math.floor(rand() * 6),
      status,
    })
  }
  return orders.sort((a, b) => b.date.localeCompare(a.date))
}
