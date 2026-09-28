/**
 * Whether a tray icon is actually live. Kept in its own module so the window
 * can consult it without creating a window <-> tray import cycle.
 */
let trayLive = false

export const setTrayLive = (value: boolean): void => {
  trayLive = value
}

export const isTrayLive = (): boolean => trayLive
