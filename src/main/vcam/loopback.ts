import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { listDir, readAttr } from '../devices/sysfs.js'

const exec = promisify(execFile)

const VIDEO_CLASS = '/sys/class/video4linux'

/** Name other apps show for our virtual camera. */
export const LOOPBACK_LABEL = 'openemeet Virtual Camera'
/** High node number, clear of real cameras that enumerate from video0. */
export const LOOPBACK_NR = 42

export interface LoopbackDevice {
  device: string
  label: string
}

/**
 * Finds the v4l2loopback node to publish on.
 *
 * Loopback devices are virtual (no USB parent), so they live under
 * /sys/devices/virtual. Our own labelled node wins; otherwise any loopback
 * node is used, so a module loaded by e.g. OBS still works.
 */
export async function findLoopbackDevice(): Promise<LoopbackDevice | null> {
  const candidates: LoopbackDevice[] = []

  for (const node of await listDir(VIDEO_CLASS)) {
    if (!node.startsWith('video')) continue
    const base = join(VIDEO_CLASS, node)

    let resolved: string
    try {
      resolved = await realpath(base)
    } catch {
      continue
    }
    if (!resolved.includes('/devices/virtual/')) continue

    const label = (await readAttr(join(base, 'name'))) ?? node
    const device = { device: `/dev/${node}`, label }
    if (label === LOOPBACK_LABEL) return device
    candidates.push(device)
  }

  return candidates[0] ?? null
}

export async function isFfmpegInstalled(): Promise<boolean> {
  try {
    await exec('ffmpeg', ['-hide_banner', '-version'])
    return true
  } catch {
    return false
  }
}

/** Loads v4l2loopback now and on every boot with our device label. */
export function loopbackSetupCommand(): string {
  const options = `devices=1 video_nr=${LOOPBACK_NR} card_label="${LOOPBACK_LABEL}" exclusive_caps=1`
  return [
    `echo 'options v4l2loopback ${options}' | sudo tee /etc/modprobe.d/openemeet-vcam.conf > /dev/null`,
    `echo v4l2loopback | sudo tee /etc/modules-load.d/openemeet-vcam.conf > /dev/null`,
    `sudo modprobe -r v4l2loopback 2>/dev/null; sudo modprobe v4l2loopback`,
  ].join('\n')
}
