// Real data fetched from Dataverse on 2026-07-06.
// Only includes records with valid distributor prefixes (EVO/UBE/SSG/INT/WES/SSP).
// Re-query Dataverse and update these constants monthly.

import type { TimePoint } from "./data"

/** Distinct salon records with a recognised distributor prefix.
 *  NOTE: 30,232 was the header record count (monthly uploads), not unique salons.
 *  Actual unique salon count is populated from Supabase salon_cache after sync. */
export const LIVE_SALON_COUNT = 30_232 // TODO: replace with live Supabase count

/** Lifetime distributor sales tracked in Dataverse (USD). */
export const LIVE_LIFETIME_SALES = 8_923_213.60

/**
 * 0-based index into MONTHS (Jan=0…Dec=11) for the most recent complete month.
 * May 2026 is the latest month with full upload data.
 */
export const LIVE_CURRENT_MONTH = 4 // May

/**
 * Monthly points timeseries keyed to MONTHS[0..11] = Jan..Dec.
 * Jan–May slots use 2026 data; Jun–Dec use 2025 data (previous complete year).
 * Tuple: [monthLabel, pointsIssued, pointsRedeemed]
 */
export const LIVE_TIMESERIES: TimePoint[] = [
  ["Jan", 443_938, 138_583], // Jan 2026
  ["Feb", 443_310, 136_346], // Feb 2026
  ["Mar", 497_397, 130_629], // Mar 2026
  ["Apr", 477_568,  94_799], // Apr 2026
  ["May", 465_320,  27_255], // May 2026
  ["Jun", 284_128, 198_008], // Jun 2025
  ["Jul", 338_741, 223_818], // Jul 2025
  ["Aug", 472_673, 204_341], // Aug 2025
  ["Sep", 603_415, 261_220], // Sep 2025
  ["Oct", 622_467, 261_072], // Oct 2025
  ["Nov", 604_692, 217_726], // Nov 2025
  ["Dec", 445_012, 149_386], // Dec 2025
]
