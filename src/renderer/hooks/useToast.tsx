import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

interface ToastValue {
  toasts: Toast[]
  notify: (message: string, tone?: Toast['tone']) => void
  /** Runs an async action and surfaces any failure as an error toast. */
  attempt: <T>(action: () => Promise<T>, successMessage?: string) => Promise<T | undefined>
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastValue | null>(null)
const TOAST_TTL_MS = 4000

/** IPC rejections arrive wrapped by Electron; show only the real message. */
export function cleanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']*':\s*/i, '').replace(/^Error:\s*/i, '')
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback<ToastValue['notify']>(
    (message, tone = 'info') => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-3), { id, message, tone }])
      setTimeout(() => dismiss(id), TOAST_TTL_MS)
    },
    [dismiss],
  )

  const attempt = useCallback<ToastValue['attempt']>(
    async (action, successMessage) => {
      try {
        const result = await action()
        if (successMessage) notify(successMessage, 'success')
        return result
      } catch (error) {
        notify(cleanErrorMessage(error), 'error')
        return undefined
      }
    },
    [notify],
  )

  const value = useMemo<ToastValue>(
    () => ({ toasts, notify, attempt, dismiss }),
    [toasts, notify, attempt, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
