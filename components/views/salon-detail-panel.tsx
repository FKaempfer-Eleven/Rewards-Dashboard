"use client"

import { useEffect, useRef, useState } from "react"
import { X, Copy, Check, Mail, KeyRound, RefreshCw, TrendingUp, ShoppingBag, Sliders } from "lucide-react"

import {
  DISTRIBUTORS,
  MONTHS,
  SALON,
  STATES,
  type Salon,
  accountNumber,
  emailFor,
  fmt,
  isActive,
  salonCity,
  salonMonthlyHistory,
  salonName,
  salonOrders,
  usd,
  username,
} from "@/lib/data"

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
  salon: Salon | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("account")
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Animate in/out
  useEffect(() => {
    if (salon) {
      setTab("account")
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [salon])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!salon) return null

  const name = salonName(salon)
  const email = emailFor(salon)
  const acct = accountNumber(salon)
  const user = username(salon)
  const active = isActive(salon)
  const dist = DISTRIBUTORS[salon[SALON.dist]]
  const state = STATES[salon[SALON.state]]
  const city = salonCity(salon)

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
                  active ? "bg-gen-soft text-[#1f7256]" : "bg-miss-soft text-muted"
                }`}
              >
                <i className="size-1.5 rounded-full" style={{ background: active ? "#2F9E78" : "#C8BBAE" }} />
                {active ? "Active" : "Dormant"}
              </span>
              <span className="text-[11px] text-faint">{acct}</span>
            </div>
            <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-[0.3px] text-ink">
              {name}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {city}, {state.abbr} · {dist.name}
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
                  on
                    ? "border-coral text-coral"
                    : "border-transparent text-muted hover:text-ink2"
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
          {tab === "account" && <AccountTab salon={salon} name={name} email={email} acct={acct} user={user} />}
          {tab === "history" && <HistoryTab salon={salon} />}
          {tab === "orders" && <OrdersTab salon={salon} />}
          {tab === "adjust" && <AdjustTab salon={salon} name={name} />}
        </div>
      </div>
    </>
  )
}

// ---- Account Tab ----

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

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-muted">{label}</div>
      <div className={`flex items-center rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink ${mono ? "font-mono" : ""}`}>
        <span className="flex-1 truncate">{value || <span className="text-faint italic">not set</span>}</span>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function AccountTab({
  salon,
  name,
  email,
  acct,
  user,
}: {
  salon: Salon
  name: string
  email: string
  acct: string
  user: string
}) {
  const [newPw, setNewPw] = useState("")
  const [pwSaved, setPwSaved] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)

  function savePw() {
    if (!newPw.trim()) return
    setPwSaved(true)
    setNewPw("")
    setTimeout(() => setPwSaved(false), 2500)
  }

  function sendInvite() {
    setInviteSent(true)
    setTimeout(() => setInviteSent(false), 3000)
  }

  return (
    <div className="space-y-5">
      <Section title="Account Details">
        <div className="grid gap-3">
          <Field label="Salon name" value={name} />
          <Field label="Account number" value={acct} mono />
          <Field label="Username" value={user} mono />
          <Field label="Email address" value={email || ""} />
        </div>
      </Section>

      <Section title="Password">
        <p className="mb-3 text-[12.5px] text-muted">
          Manually set a new password for this account. The salon will be prompted to change it on next login.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter new password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && savePw()}
            className="flex-1 rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-coral"
          />
          <button
            onClick={savePw}
            disabled={!newPw.trim()}
            className="flex items-center gap-1.5 rounded-[10px] bg-ink px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-ink2 disabled:opacity-40"
          >
            {pwSaved ? <Check className="size-3.5" /> : <KeyRound className="size-3.5" />}
            {pwSaved ? "Saved" : "Set password"}
          </button>
        </div>
      </Section>

      <Section title="Invite">
        <p className="mb-3 text-[12.5px] text-muted">
          Resend the portal invitation email. The salon must accept the invite before they can access their account.
        </p>
        {!email && (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-err-soft bg-err-soft px-3 py-2.5 text-[12.5px] text-[#c9483b]">
            <Mail className="size-3.5 flex-none" />
            No email address on file — add one before sending an invite.
          </div>
        )}
        <button
          onClick={sendInvite}
          disabled={!email}
          className="flex items-center gap-2 rounded-[10px] border border-line bg-paper2 px-4 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-coral hover:text-coral disabled:opacity-40"
        >
          {inviteSent ? <Check className="size-3.5 text-gen" /> : <RefreshCw className="size-3.5" />}
          {inviteSent ? "Invite sent!" : "Resend invite email"}
        </button>
      </Section>
    </div>
  )
}

// ---- Points History Tab ----

function HistoryTab({ salon }: { salon: Salon }) {
  const history = salonMonthlyHistory(salon)
  const totalPurchases = history.reduce((a, r) => a + r.purchases, 0)
  const totalPoints = history.reduce((a, r) => a + r.pointsEarned, 0)
  const activeMonths = history.filter((r) => r.purchases > 0).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Active months" value={String(activeMonths)} />
        <StatCard label="Total purchases" value={usd(totalPurchases)} />
        <StatCard label="Total points earned" value={fmt(totalPoints)} />
      </div>

      <Section title="Monthly Breakdown">
        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-paper2">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Month</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Purchases</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">Points Earned</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => (
                <tr key={i} className={`border-b border-line2 ${row.purchases === 0 ? "text-faint" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{row.month}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.purchases > 0 ? usd(row.purchases) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.pointsEarned > 0 ? fmt(row.pointsEarned) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-paper2 font-semibold">
                <td className="px-4 py-2.5 text-[11px] uppercase tracking-[0.4px] text-muted">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{usd(totalPurchases)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalPoints)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </div>
  )
}

// ---- Orders Tab ----

function OrdersTab({ salon }: { salon: Salon }) {
  const orders = salonOrders(salon)
  const totalRedeemed = orders.reduce((a, o) => a + o.pointsRedeemed, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total orders" value={String(orders.length)} />
        <StatCard label="Total spent" value={usd(orders.reduce((a, o) => a + o.amount, 0))} />
        <StatCard label="Points redeemed" value={fmt(totalRedeemed)} />
      </div>

      <Section title="Order History">
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-[10px] border border-line bg-white px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-medium text-ink">{order.id}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                      order.status === "Completed"
                        ? "bg-gen-soft text-[#1f7256]"
                        : order.status === "Refunded"
                          ? "bg-err-soft text-[#c9483b]"
                          : "bg-proc-soft text-[#b07c18]"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {order.date} · {order.items} item{order.items !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium tabular-nums text-ink">{usd(order.amount)}</div>
                {order.pointsRedeemed > 0 && (
                  <div className="text-[11.5px] text-coral">
                    −{fmt(order.pointsRedeemed)} pts
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ---- Adjust Tab ----

function AdjustTab({ salon, name }: { salon: Salon; name: string }) {
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

  const currentPoints = fmt(salon[SALON.points])

  return (
    <div className="space-y-5">
      <Section title="Points Balance">
        <div className="flex items-center justify-between rounded-[10px] border border-line bg-white px-4 py-3">
          <span className="text-[13px] text-muted">Current balance</span>
          <span className="font-display text-[20px] font-semibold tabular-nums text-ink">{currentPoints} pts</span>
        </div>
      </Section>

      <Section title="Manual Points Adjustment">
        <p className="mb-3 text-[12.5px] text-muted">
          Add or remove points from {name}&apos;s balance. All adjustments are logged.
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

// ---- Shared helpers ----

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
