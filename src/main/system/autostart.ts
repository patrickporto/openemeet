import { app } from 'electron'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { log } from '../logger.js'

/** Passed on the autostart command line so the app knows it was launched at login. */
export const AUTOSTART_FLAG = '--autostart'

/**
 * Electron's setLoginItemSettings is a no-op on Linux, so we follow the XDG
 * Autostart spec directly: a .desktop entry in ~/.config/autostart is picked
 * up by GNOME, KDE, XFCE, Cinnamon and friends at login.
 */
function autostartPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'autostart', 'openemeet.desktop')
}

/** Quotes one Exec argument per the Desktop Entry spec. */
function quoteArg(arg: string): string {
  const escaped = arg.replace(/(["`$\\])/g, '\\$1')
  // The .desktop parser unescapes backslashes once more before Exec parsing.
  return `"${escaped.replace(/\\/g, '\\\\')}"`
}

/** The command that relaunches this exact install. */
function launchCommand(): string[] {
  // An AppImage's execPath points into a temporary mount; APPIMAGE is the real file.
  const binary = process.env.APPIMAGE || process.execPath
  // Unpackaged (dev) runs need the app directory as well as the electron binary.
  const base = app.isPackaged ? [binary] : [binary, app.getAppPath()]
  return [...base, AUTOSTART_FLAG]
}

function desktopEntry(): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=openemeet',
    'Comment=Control center for EMEET PIXY cameras',
    `Exec=${launchCommand().map(quoteArg).join(' ')}`,
    'Icon=openemeet',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'X-GNOME-Autostart-Delay=3',
    '',
  ].join('\n')
}

export function isAutostartEnabled(): boolean {
  return existsSync(autostartPath())
}

export function setAutostart(enabled: boolean): void {
  const path = autostartPath()
  if (!enabled) {
    rmSync(path, { force: true })
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, desktopEntry(), 'utf8')
  renameSync(tmp, path)
}

/** True when this process was started by the session's autostart. */
export function launchedAtLogin(): boolean {
  return process.argv.includes(AUTOSTART_FLAG)
}

/**
 * The autostart file is the source of truth: the user may remove it from
 * their desktop's startup settings. When it exists we rewrite it, so the
 * entry follows the AppImage if it was moved or updated.
 */
export function reconcileAutostart(): boolean {
  const enabled = isAutostartEnabled()
  if (enabled) {
    try {
      setAutostart(true)
    } catch (err) {
      log.warn('Could not refresh autostart entry:', err)
    }
  }
  return enabled
}
