import { join } from 'node:path'
import type { Camera } from '../../shared/types.js'
import { PIXY_PRODUCT_ID, PIXY_VENDOR_ID } from '../../shared/types.js'
import { checkAccess } from './hid.js'
import { listDir, readAttr, readUevent, readUsbDevice, resolveUsbPath } from './sysfs.js'

const VIDEO_CLASS = '/sys/class/video4linux'
const HIDRAW_CLASS = '/sys/class/hidraw'

interface VideoNode {
  node: string
  device: string
  usbPath: string
  index: number
  name: string
}

/**
 * A UVC camera exposes several /dev/videoN nodes (capture, metadata...).
 * Only index 0 is the streaming capture node we want to drive.
 */
async function scanVideoNodes(): Promise<VideoNode[]> {
  const out: VideoNode[] = []

  for (const node of await listDir(VIDEO_CLASS)) {
    if (!node.startsWith('video')) continue

    const base = join(VIDEO_CLASS, node)
    const index = Number(await readAttr(join(base, 'index')))
    if (index !== 0) continue

    const usbPath = await resolveUsbPath(join(base, 'device'))
    if (!usbPath) continue

    out.push({
      node,
      device: `/dev/${node}`,
      usbPath,
      index,
      name: (await readAttr(join(base, 'name'))) ?? node,
    })
  }

  return out
}

/** Maps USB device path -> hidraw device node, for pairing with video nodes. */
async function scanHidrawNodes(): Promise<Map<string, string>> {
  const map = new Map<string, string>()

  for (const node of await listDir(HIDRAW_CLASS)) {
    if (!node.startsWith('hidraw')) continue

    const base = join(HIDRAW_CLASS, node)
    const uevent = await readUevent(join(base, 'device', 'uevent'))
    const hidId = (uevent.HID_ID ?? '').toLowerCase()

    // HID_ID is `bus:VVVVVVVV:PPPPPPPP` — match the PIXY vendor/product.
    const vendorHex = PIXY_VENDOR_ID.toString(16).padStart(4, '0')
    const productHex = PIXY_PRODUCT_ID.toString(16).padStart(4, '0')
    if (!hidId.includes(vendorHex) || !hidId.includes(productHex)) continue

    const usbPath = await resolveUsbPath(join(base, 'device'))
    if (!usbPath) continue

    // A device may expose several hidraw interfaces; the first is the control one.
    if (!map.has(usbPath)) map.set(usbPath, `/dev/${node}`)
  }

  return map
}

export interface ScanOptions {
  /** Include non-PIXY UVC webcams (V4L2 controls only, no HID features). */
  includeGenericCameras: boolean
}

export async function scanCameras(options: ScanOptions): Promise<Camera[]> {
  const [videoNodes, hidrawByUsb] = await Promise.all([scanVideoNodes(), scanHidrawNodes()])
  const cameras: Camera[] = []

  for (const video of videoNodes) {
    const usb = await readUsbDevice(video.usbPath)
    if (!usb) continue

    const isPixy = usb.vendorId === PIXY_VENDOR_ID && usb.productId === PIXY_PRODUCT_ID
    if (!isPixy && !options.includeGenericCameras) continue

    const hidrawDevice = isPixy ? (hidrawByUsb.get(video.usbPath) ?? null) : null
    const access = hidrawDevice ? checkAccess(hidrawDevice) : { readable: false, writable: false }

    cameras.push({
      // Serial is the strongest identity; fall back to the USB port path.
      id: usb.serial ? `${usb.vendorId.toString(16)}:${usb.productId.toString(16)}:${usb.serial}` : `usb:${video.usbPath}`,
      label: usb.product?.trim() || video.name,
      serial: usb.serial,
      usbPath: video.usbPath,
      videoDevice: video.device,
      hidrawDevice,
      v4l2Name: video.name,
      isPixy,
      mock: false,
      capabilities: {
        hid: Boolean(hidrawDevice) && access.readable && access.writable,
        ptz: isPixy,
        hidPermissionDenied: Boolean(hidrawDevice) && !(access.readable && access.writable),
      },
      state: {
        tracking: 'unknown', gesture: 'unknown', audio: 'unknown',
        autoPrivacySeconds: null, activePresetId: null,
      },
    })
  }

  // Deterministic order so the sidebar does not reshuffle between scans.
  cameras.sort((a, b) => Number(b.isPixy) - Number(a.isPixy) || a.usbPath.localeCompare(b.usbPath))
  return cameras
}
