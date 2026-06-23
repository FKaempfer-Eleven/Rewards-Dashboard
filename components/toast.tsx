"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"

const ToastContext = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((m: string) => {
    setMsg(m)
    setVisible(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-[#ede6df] shadow-[var(--shadow-lg)] transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <Check className="size-4 text-gen" strokeWidth={3} />
        {msg}
      </div>
    </ToastContext.Provider>
  )
}
