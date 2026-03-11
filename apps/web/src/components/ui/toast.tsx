import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import { CheckCircle, AlertTriangle, Info, X } from "lucide-react"

export type ToastType = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICON_MAP: Record<ToastType, { Icon: typeof CheckCircle; className: string }> = {
  success: { Icon: CheckCircle, className: "text-pass" },
  error: { Icon: AlertTriangle, className: "text-fail" },
  warning: { Icon: AlertTriangle, className: "text-blocked" },
  info: { Icon: Info, className: "text-primary" },
}

const AUTO_DISMISS_MS = 4000

let nextId = 0

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(t.id), AUTO_DISMISS_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [t.id, onDismiss])

  const { Icon, className: iconClassName } = ICON_MAP[t.type]

  return (
    <div
      role="alert"
      className="flex min-w-[300px] max-w-[420px] items-start gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-toast"
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${iconClassName}`} aria-hidden="true" />
      <p className="flex-1 text-sm text-gray-800">{t.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++nextId}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return ctx
}
