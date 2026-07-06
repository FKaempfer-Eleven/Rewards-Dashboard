"use client"

import { useEffect, useRef, useState } from "react"
import { X, Copy, Check, Mail, KeyRound, RefreshCw, TrendingUp, ShoppingBag, Sliders } from "lucide-react"

import { DISTRIBUTORS, fmt, usd, usdC } from "@/lib/data"
import { type LiveSalon, lastPurchaseLabel } from "@/lib/live-salon"

type Tab = "account" | "history" | "orders" | "adjust"

const TABS: { key: Tab; label: string; icon: typeof Mail }[] = [
  { key: "account", label: "Account", icon: KeyRound },
  { key: "history", label: "Points History", icon: TrendingUp },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "adjust", label: "Adjust", icon: Sliders },
]

export function SalonDetailPanel({
  salon,
  onClose,
}: {
  salon: LiveSalon | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("account")
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (salon) {
      setTab("account")
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [salon])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!salon) return null

  const dist = salon.distributorIdx >= 0 ? DISTRIBUTORS[salon.distributorIdx] : null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-paper shadow-2xl transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line bg-paper2 px-6 py-5">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  salon.isActive ? "bg-gen-soft text-[#1f7256]" : "bg-miss-soft text-muted"
                }`}
              >
                <i
                  className="size-1.5 rounded-full"
                  style={{ background: salon.isActive ? "#2F9E78" : "#C8BBAE" }}
                />
                {salon.isActive ? "Active" : "Dormant"}
              </span>
              <span className="text-[11px] text-faint">{salon.acctnumber ?? "—"}</span>
            </div>
            <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-[0.3px] text-ink">
              {salon.salonName}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {salon.city && salon.state
                ? `${salon.city}, ${salon.state}`
                : salon.city || salon.state || "Location unknown"}
              {dist && ` · ${dist.name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full border border-line text-faint transition-colors hover:border-coral hover:text-coral"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line bg-paper2 px-4">
          {TABS.map((t) => {
            const Icon = t.icon
            const on = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-[12px] font-medium transition-colors ${
                  on ? "border-coral text-coral" : "border-transparent text-muted hover:text-ink2"
                }`}
              >
                <Icon className="size-3.5" strokeWidth={1.8} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "account" && <AccountTab salon={salon} />}
          {tab === "history" && <HistoryTab salon={salon} />}
          {tab === "orders" && <OrdersTab salon={salon} />}
          {tab === "adjust" && <AdjustTab salon={salon} />}
        </div>
      </div>
    </>
  )
}

// ── Account Tab ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button onClick={copy} className="ml-1.5 text-faint transition-colors hover:text-coral">
      {copied ? <Check className="size-3.5 text-gen" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">{label}</div>
      <div className="flex items-center rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink">
        <span className="flex-1 truncate">{value || <span className="text-faint italic">not set</span>}</span>
        {value && <CopyButton value={value} />}
      </div>
    </div>
  )
}

function AccountTab({ salon }: { salon: LiveSalon }) {
  const [inviteSent, setInviteSent] = useState(false)

  function sendInvite() {
    setInviteSent(true)
    setTimeout(() => setInviteSent(false), 3000)
  }

  const username = salon.email ? salon.email.split("@")[0] : ""

  return (
    <div className="space-y-5">
      <Section title="Account Details">
        <div className="grid gap-3">
          <Field label="Salon name" value={salon.salonName} />
          <Field label="Contact name" value={salon.contactName} />
          <Field label="Account number" value={salon.acctnumber ?? ""} />
          <Field label="Email address" value={salon.email ?? ""} />
          <Field label="Address" value={[salon.city, salon.state, salon.zip, salon.country].filter(Boolean).join(", ")} />
          {username && <Field label="Portal username" value={username} />}
        </div>
      </Section>

      <Section title="Invite">
        <p className="mb-3 text-[12.5px] text-muted">
          Resend the portal invitation email to this salon.
        </p>
        {!salon.email && (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-err-soft bg-err-soft px-3 py-2.5 text-[12.5px] text-[#c9483b]">
            <Mail className="size-3.5 flex-none" />
            No email address on file — add one before sending an invite.
          </div>
        )}
        <button
          onClick={sendInvite}
          disabled={!salon.email}
          className="flex items-center gap-2 rounded-[10px] border border-line bg-paper2 px-4 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-coral hover:text-coral disabled:opacity-40"
        >
          {inviteSent ? <Check className="size-3.5 text-gen" /> : <RefreshCw className="size-3.5" />}
          {inviteSent ? "Invite sent!" : "Resend invite email"}
        </button>
      </Section>
    </div>
  )
}

// ── History Tab ────────────────────────────────────────────────────────────────

function HistoryTab({ salon }: { salon: LiveSalon }) {
  const redemptionRate =
    salon.lifetimePointsIssued > 0
      ? ((salon.lifetimePointsRedeemed / salon.lifetimePointsIssued) * 100).toFixed(1)
      : "0"

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Months on program" value={String(salon.monthCount)} />
        <StatCard label="Lifetime sales" value={usdC(salon.lifetimeSales)} />
        <StatCard label="Points issued" value={fmt(salon.lifetimePointsIssued)} />
        <StatCard label="Points redeemed" value={fmt(salon.lifetimePointsRedeemed)} />
      </div>

      <Section title="Summary">
        <div className="space-y-2.5 rounded-[10px] border border-line bg-white p-4 text-[13px]">
          <Row label="Average monthly spend" value={usd(salon.avgMonthlySales)} />
          <Row label="Redemption rate" value={`${redemptionRate}% of issued`} />
          <Row label="Points balance" value={fmt(salon.pointsBalance)} />
          <Row label="Last purchase" value={lastPurchaseLabel(salon.lastPurchase)} />
          <Row
            label="Status"
            value={salon.isActive ? "Active (purchased in last 12 mo)" : "Dormant (no recent purchase)"}
          />
        </div>
      </Section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line2 pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  )
}

// ── Orders Tab ─────────────────────────────────────────────────────────────────

function OrdersTab({ salon }: { salon: LiveSalon }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total redeemed" value={fmt(salon.lifetimePointsRedeemed)} />
        <StatCard label="Points balance" value={fmt(salon.pointsBalance)} />
      </div>

      <Section title="Order History">
        <div className="flex items-center justify-center rounded-[10px] border border-line bg-white px-4 py-10 text-center text-[13px] text-faint">
          <div>
            <ShoppingBag className="mx-auto mb-3 size-8 text-line" strokeWidth={1.2} />
            <p className="font-medium text-muted">Live order history coming soon</p>
            <p className="mt-1 text-[12px]">
              Orders will be pulled from Dataverse once the full API layer is connected.
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Adjust Tab ─────────────────────────────────────────────────────────────────

function AdjustTab({ salon }: { salon: LiveSalon }) {
  const [pointsAdj, setPointsAdj] = useState("")
  const [adjReason, setAdjReason] = useState("")
  const [adjDone, setAdjDone] = useState<"add" | "remove" | null>(null)
  const [refundAmt, setRefundAmt] = useState("")
  const [refundReason, setRefundReason] = useState("")
  const [refundDone, setRefundDone] = useState(false)

  function applyAdjustment(type: "add" | "remove") {
    if (!pointsAdj.trim()) return
    setAdjDone(type)
    setPointsAdj("")
    setAdjReason("")
    setTimeout(() => setAdjDone(null), 2500)
  }

  function issueRefund() {
    if (!refundAmt.trim()) return
    setRefundDone(true)
    setRefundAmt("")
    setRefundReason("")
    setTimeout(() => setRefundDone(false), 2500)
  }

  return (
    <div className="space-y-5">
      <Section title="Points Balance">
        <div className="flex items-center justify-between rounded-[10px] border border-line bg-white px-4 py-3">
          <span className="text-[13px] text-muted">Current balance</span>
          <span className="font-display text-[20px] font-semibold tabular-nums text-ink">
            {fmt(salon.pointsBalance)} pts
          </span>
        </div>
      </Section>

      <Section title="Manual Points Adjustment">
        <p className="mb-3 text-[12.5px] text-muted">
          Add or remove points from {salon.salonName}&apos;s balance. All adjustments are logged.
        </p>
        <div className="space-y-2.5">
          <input
            type="number"
            min="0"
            placeholder="Number of points"
            value={pointsAdj}
            onChange={(e) => setPointsAdj(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-coral"
          />
          <input
            type="text"
            placeholder="Reason (optional)"
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-coral"
          />
          <div className="flex gap-2">
            <button
              onClick={() => applyAdjustment("add")}
              disabled={!pointsAdj.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-gen px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#27855f] disabled:opacity-40"
            >
              {adjDone === "add" ? <Check className="size-3.5" /> : null}
              {adjDone === "add" ? "Added!" : "+ Add points"}
            </button>
            <button
              onClick={() => applyAdjustment("remove")}
              disabled={!pointsAdj.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-err bg-err-soft px-4 py-2.5 text-[13px] font-medium text-[#c9483b] transition-colors hover:bg-err hover:text-white disabled:opacity-40"
            >
              {adjDone === "remove" ? <Check className="size-3.5" /> : null}
              {adjDone === "remove" ? "Removed!" : "− Remove points"}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Issue Refund">
        <p className="mb-3 text-[12.5px] text-muted">
          Issue a refund against a purchase. Points earned on the refunded amount will be reversed.
        </p>
        <div className="space-y-2.5">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Refund amount (USD)"
            value={refundAmt}
            onChange={(e) => setRefundAmt(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-coral"
          />
          <input
            type="text"
            placeholder="Reason (optional)"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-coral"
          />
          <button
            onClick={issueRefund}
            disabled={!refundAmt.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-coral px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-coral-deep disabled:opacity-40"
          >
            {refundDone ? <Check className="size-3.5" /> : null}
            {refundDone ? "Refund issued!" : "Issue refund"}
          </button>
        </div>
      </Section>
    </div>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.8px] text-muted">{title}</div>
      {children}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3px] text-muted">{label}</div>
      <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  )
}
