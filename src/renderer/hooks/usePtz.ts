import { useCallback, useEffect, useRef, useState } from 'react'
import type { PtzPosition } from '@shared/ipc'
import { cleanErrorMessage } from './useToast'

const WRITE_INTERVAL_MS = 90

/**
 * PTZ state with optimistic updates.
 *
 * v4l2 writes take tens of milliseconds, so dragging would queue far more
 * requests than the camera can absorb. The UI follows the pointer immediately
 * while writes are coalesced onto a trailing interval.
 */
export function usePtz(cameraId: string | null, onError?: (message: string) => void) {
  const [position, setPosition] = useState<PtzPosition>({ pan: 0, tilt: 0, zoom: 100 })
  const [busy, setBusy] = useState(false)

  const pending = useRef<Partial<PtzPosition> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const cameraRef = useRef(cameraId)
  cameraRef.current = cameraId

  const reload = useCallback(async () => {
    if (!cameraId) return
    try {
      setPosition(await window.openemeet.ptz.get(cameraId))
    } catch (error) {
      onError?.(cleanErrorMessage(error))
    }
  }, [cameraId, onError])

  useEffect(() => {
    void reload()
  }, [reload])

  const flush = useCallback(async () => {
    const id = cameraRef.current
    const values = pending.current

    if (!id || !values || inFlight.current) return
    pending.current = null
    inFlight.current = true
    setBusy(true)

    try {
      const actual = await window.openemeet.ptz.set(id, values)
      // Only trust the camera once the user has stopped moving the control.
      if (!pending.current) setPosition(actual)
    } catch (error) {
      onError?.(cleanErrorMessage(error))
      await reload()
    } finally {
      inFlight.current = false
      setBusy(false)
      if (pending.current) schedule()
    }
  }, [onError, reload])

  const schedule = useCallback(() => {
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      void flush()
    }, WRITE_INTERVAL_MS)
  }, [flush])

  /** Moves the UI now and queues the hardware write. */
  const move = useCallback(
    (values: Partial<PtzPosition>) => {
      setPosition((current) => ({ ...current, ...values }))
      pending.current = { ...pending.current, ...values }
      schedule()
    },
    [schedule],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const center = useCallback(async () => {
    if (!cameraId) return
    pending.current = null
    try {
      setPosition(await window.openemeet.ptz.center(cameraId))
    } catch (error) {
      onError?.(cleanErrorMessage(error))
    }
  }, [cameraId, onError])

  return { position, move, center, reload, busy, setPosition }
}
