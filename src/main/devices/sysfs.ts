import { readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** Reads a sysfs attribute, returning null instead of throwing. */
export async function readAttr(path: string): Promise<string | null> {
  try {
    return (await readFile(path, 'utf8')).trim()
  } catch {
    return null
  }
}

export async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

/**
 * Walks up a resolved sysfs device path to the owning USB device directory.
 *
 * Interface dirs look like `3-1.2:1.0`; the device itself is `3-1.2`. Returning
 * the device path gives us a stable key shared by a camera's video and hidraw
 * nodes, which is how we pair them when several cameras are plugged in.
 */
export async function resolveUsbPath(devicePath: string): Promise<string | null> {
  let current: string
  try {
    current = await realpath(devicePath)
  } catch {
    return null
  }

  while (current && current !== '/' && current !== '/sys') {
    const name = basename(current)
    if (/^\d+-[\d.]+$/.test(name)) return name
    current = dirname(current)
  }
  return null
}

export interface UsbDeviceInfo {
  vendorId: number
  productId: number
  serial: string | null
  product: string | null
  manufacturer: string | null
}

export async function readUsbDevice(usbPath: string): Promise<UsbDeviceInfo | null> {
  const base = join('/sys/bus/usb/devices', usbPath)
  const vendor = await readAttr(join(base, 'idVendor'))
  const product = await readAttr(join(base, 'idProduct'))
  if (!vendor || !product) return null

  return {
    vendorId: parseInt(vendor, 16),
    productId: parseInt(product, 16),
    serial: await readAttr(join(base, 'serial')),
    product: await readAttr(join(base, 'product')),
    manufacturer: await readAttr(join(base, 'manufacturer')),
  }
}

/** Parses `KEY=value` lines from a sysfs uevent file. */
export async function readUevent(path: string): Promise<Record<string, string>> {
  const text = await readAttr(path)
  if (!text) return {}

  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}
