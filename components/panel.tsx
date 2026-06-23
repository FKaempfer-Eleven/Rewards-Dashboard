import type { ReactNode } from "react"

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[14px] border border-line bg-card shadow-[var(--shadow)] ${className}`}
    >
      {children}
    </div>
  )
}

export function PanelHeader({
  title,
  hint,
}: {
  title: string
  hint?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line2 px-5 py-[17px]">
      <h2 className="font-display text-[16px] font-semibold uppercase tracking-[0.6px] text-ink">
        {title}
      </h2>
      {hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-1.5 font-display text-[11px] uppercase tracking-[2.5px] text-coral">
          {eyebrow}
        </div>
        <h1 className="font-display text-[34px] font-semibold leading-none tracking-[0.5px] text-balance">
          {title}
        </h1>
        <p className="mt-2.5 max-w-[560px] text-[13.5px] leading-relaxed text-muted text-pretty">
          {description}
        </p>
      </div>
      {children}
    </div>
  )
}
