import { useCallback, useEffect, useState } from 'react'
import type { Camera } from '@shared/types'

export function useCameras() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    void window.openemeet.cameras.list().then((list) => {
      if (!active) return
      setCameras(list)
      setLoading(false)
    })

    // Main pushes the full list on hotplug and on any state change.
    const unsubscribe = window.openemeet.cameras.onChanged((list) => {
      if (active) setCameras(list)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setCameras(await window.openemeet.cameras.refresh())
    } finally {
      setLoading(false)
    }
  }, [])

  return { cameras, loading, refresh }
}

export function useSettings() {
  const [settings, setSettings] = useState<import('@shared/types').AppSettings | null>(null)

  useEffect(() => {
    let active = true
    void window.openemeet.settings.get().then((value) => {
      if (active) setSettings(value)
    })
    const unsubscribe = window.openemeet.settings.onChanged((value) => {
      if (active) setSettings(value)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const patch = useCallback(async (values: Partial<import('@shared/types').AppSettings>) => {
    setSettings(await window.openemeet.settings.patch(values))
  }, [])

  return { settings, patch }
}
