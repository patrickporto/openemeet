import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { V4l2Control } from '../../shared/types.js'

const exec = promisify(execFile)

export class V4l2Error extends Error {}

let v4l2Available: boolean | null = null

export async function isV4l2CtlInstalled(): Promise<boolean> {
  if (v4l2Available !== null) return v4l2Available
  try {
    await exec('v4l2-ctl', ['--version'])
    v4l2Available = true
  } catch {
    v4l2Available = false
  }
  return v4l2Available
}

async function run(args: string[]): Promise<string> {
  try {
    const { stdout } = await exec('v4l2-ctl', args, { timeout: 5000 })
    return stdout
  } catch (err) {
    const e = err as { code?: string; stderr?: string; stdout?: string; message: string }
    if (e.code === 'ENOENT') throw new V4l2Error('v4l2-ctl is not installed')
    throw new V4l2Error((e.stderr || e.stdout || e.message).trim())
  }
}

/**
 * Matches a control line, e.g.
 *   `brightness 0x00980900 (int) : min=-64 max=64 step=1 default=0 value=0`
 * Menu entries are indented `0: Disabled` lines that follow a (menu) control.
 */
const CONTROL_RE = /^\s*(\w+)\s+0x[0-9a-f]+\s+\((\w+)\)\s*:\s*(.*)$/i
const MENU_ITEM_RE = /^\s+(\d+):\s*(.+)$/

function parseFields(rest: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const match of rest.matchAll(/(\w+)=(-?\d+)/g)) fields[match[1]] = match[2]
  if (/flags=[^\s]*inactive/.test(rest)) fields.inactive = '1'
  return fields
}

function normaliseType(raw: string): V4l2Control['type'] {
  switch (raw.toLowerCase()) {
    case 'int':
    case 'integer':
      return 'int'
    case 'int64':
      return 'int64'
    case 'bool':
    case 'boolean':
      return 'bool'
    case 'menu':
    case 'intmenu':
      return 'menu'
    case 'button':
      return 'button'
    default:
      return 'unknown'
  }
}

export async function listControls(device: string): Promise<V4l2Control[]> {
  const stdout = await run(['-d', device, '--list-ctrls-menus'])
  const controls: V4l2Control[] = []
  let current: V4l2Control | null = null

  for (const line of stdout.split('\n')) {
    const menuItem = current?.type === 'menu' ? MENU_ITEM_RE.exec(line) : null
    if (menuItem && !CONTROL_RE.test(line)) {
      current!.menu ??= []
      current!.menu.push({ value: Number(menuItem[1]), label: menuItem[2].trim() })
      continue
    }

    const match = CONTROL_RE.exec(line)
    if (!match) continue

    const [, name, rawType, rest] = match
    const fields = parseFields(rest)
    const type = normaliseType(rawType)

    current = {
      name,
      type,
      min: fields.min !== undefined ? Number(fields.min) : type === 'bool' ? 0 : 0,
      max: fields.max !== undefined ? Number(fields.max) : type === 'bool' ? 1 : 0,
      step: fields.step !== undefined ? Number(fields.step) : 1,
      default: fields.default !== undefined ? Number(fields.default) : 0,
      value: fields.value !== undefined ? Number(fields.value) : 0,
      inactive: fields.inactive === '1',
    }
    controls.push(current)
  }

  return controls
}

export async function getControl(device: string, name: string): Promise<number> {
  const stdout = await run(['-d', device, `--get-ctrl=${name}`])
  const match = /-?\d+/.exec(stdout.split(':').slice(1).join(':'))
  if (!match) throw new V4l2Error(`Could not parse ${name}: ${stdout.trim()}`)
  return Number(match[0])
}

export async function setControl(device: string, name: string, value: number): Promise<void> {
  await run(['-d', device, `--set-ctrl=${name}=${Math.round(value)}`])
}

/** Applies several controls in one v4l2-ctl invocation (atomic-ish, fewer ioctls). */
export async function setControls(device: string, values: Record<string, number>): Promise<void> {
  const entries = Object.entries(values)
  if (entries.length === 0) return
  await run(['-d', device, ...entries.map(([k, v]) => `--set-ctrl=${k}=${Math.round(v)}`)])
}

/**
 * Auto-mode controls that must be switched to manual before their
 * partner control accepts a value. Mirrors the reference implementation.
 */
const AUTO_PARTNER: Record<string, { control: string; manualValue: number }> = {
  exposure_time_absolute: { control: 'auto_exposure', manualValue: 1 },
  white_balance_temperature: { control: 'white_balance_automatic', manualValue: 0 },
  focus_absolute: { control: 'focus_automatic_continuous', manualValue: 0 },
}

/** Drops a control out of auto mode so a manual write will stick. */
export async function prepareManualControl(device: string, name: string): Promise<void> {
  const partner = AUTO_PARTNER[name]
  if (!partner) return
  try {
    await setControl(device, partner.control, partner.manualValue)
  } catch {
    // Camera may not expose the auto partner; the manual write will report the real error.
  }
}

export function getAutoPartner(name: string): string | null {
  return AUTO_PARTNER[name]?.control ?? null
}

export async function getFormats(device: string): Promise<string> {
  return run(['-d', device, '--list-formats-ext'])
}
