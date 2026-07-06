// Cache warmup endpoint — called by Vercel Cron every 30 minutes.
// Pre-populates the salon cache so users never experience a cold start.

import { NextResponse } from "next/server"
import { getAllSalons } from "@/lib/salon-cache"

export const maxDuration = 60

export async function GET() {
  const start = Date.now()
  try {
    const salons = await getAllSalons()
    return NextResponse.json({
      ok: true,
      count: salons.length,
      ms: Date.now() - start,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err), ms: Date.now() - start },
      { status: 500 }
    )
  }
}
