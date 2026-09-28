import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { userInfo } from 'node:os'
import type { SystemDiagnostics } from '../../shared/types.js'
import { isV4l2CtlInstalled } from '../devices/v4l2.js'
import { PIXY_PRODUCT_ID, PIXY_VENDOR_ID } from '../../shared/types.js'

const exec = promisify(execFile)

export const UDEV_RULE_PATH = '/etc/udev/rules.d/99-openemeet-pixy.rules'

/** Any rules file granting access to the PIXY counts, including the legacy one. */
const KNOWN_RULE_PATHS = [UDEV_RULE_PATH, '/etc/udev/rules.d/99-emeet-pixy.rules']

export function udevRuleContent(): string {
  const vendor = PIXY_VENDOR_ID.toString(16).padStart(4, '0')
  const product = PIXY_PRODUCT_ID.toString(16).padStart(4, '0')

  return [
    '# openemeet - EMEET PIXY access rules',
    '# Grants the logged-in user access to the proprietary HID control channel',
    '# (AI tracking, gestures, audio modes, privacy) and the UVC video nodes.',
    `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="${vendor}", ATTRS{idProduct}=="${product}", MODE="0660", GROUP="video", TAG+="uaccess"`,
    `SUBSYSTEM=="video4linux", ATTRS{idVendor}=="${vendor}", ATTRS{idProduct}=="${product}", MODE="0660", GROUP="video", TAG+="uaccess"`,
    '',
  ].join('\n')
}

export function udevInstallCommand(): string {
  return [
    `sudo tee ${UDEV_RULE_PATH} > /dev/null <<'EOF'`,
    udevRuleContent().trimEnd(),
    'EOF',
    'sudo udevadm control --reload-rules && sudo udevadm trigger',
  ].join('\n')
}

async function hasUdevRule(): Promise<boolean> {
  for (const path of KNOWN_RULE_PATHS) {
    try {
      const text = await readFile(path, 'utf8')
      if (text.toLowerCase().includes(PIXY_VENDOR_ID.toString(16))) return true
    } catch {
      // Missing file is the normal case before install.
    }
  }
  return false
}

async function inVideoGroup(): Promise<boolean> {
  try {
    const { stdout } = await exec('id', ['-nG', userInfo().username])
    return stdout.split(/\s+/).includes('video')
  } catch {
    return false
  }
}

/**
 * GNOME on Wayland has no built-in tray. A StatusNotifierItem host extension
 * must be enabled for Electron's Tray to appear at all.
 */
const APPINDICATOR_UUIDS = [
  'appindicatorsupport@rgcjonas.gmail.com',
  'ubuntu-appindicators@ubuntu.com',
  'tray-icons-reloaded@selfmade.pl',
  'trayIconsReloaded@selfmade.pl',
]

async function detectAppIndicator(): Promise<SystemDiagnostics['gnomeAppIndicatorExtension']> {
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase()
  if (!desktop.includes('gnome')) return 'not-gnome'

  try {
    const { stdout: enabled } = await exec('gnome-extensions', ['list', '--enabled'])
    if (APPINDICATOR_UUIDS.some((uuid) => enabled.includes(uuid))) return 'enabled'

    const { stdout: all } = await exec('gnome-extensions', ['list'])
    return APPINDICATOR_UUIDS.some((uuid) => all.includes(uuid)) ? 'disabled' : 'missing'
  } catch {
    return 'missing'
  }
}

export async function collectDiagnostics(): Promise<SystemDiagnostics> {
  const [v4l2CtlInstalled, udevRuleInstalled, userInVideoGroup, extension] = await Promise.all([
    isV4l2CtlInstalled(),
    hasUdevRule(),
    inVideoGroup(),
    detectAppIndicator(),
  ])

  return {
    v4l2CtlInstalled,
    udevRuleInstalled,
    userInVideoGroup,
    gnomeAppIndicatorExtension: extension,
    // On non-GNOME desktops the tray generally just works.
    trayAvailable: extension === 'enabled' || extension === 'not-gnome',
    desktop: process.env.XDG_CURRENT_DESKTOP ?? 'unknown',
    sessionType: process.env.XDG_SESSION_TYPE ?? 'unknown',
  }
}
