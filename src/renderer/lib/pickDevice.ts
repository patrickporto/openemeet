/**
 * Matches a V4L2 device to a MediaDeviceInfo.
 *
 * Chromium labels video inputs with the UVC product name, so we match on that
 * rather than on the /dev/videoN path, which the web layer never sees.
 */
export function pickDeviceId(
  devices: MediaDeviceInfo[],
  names: { v4l2Name: string; label: string },
  options: { exclude?: string[]; strict?: boolean } = {},
): string | undefined {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const excluded = (options.exclude ?? []).map(normalise).filter(Boolean)
  const inputs = devices.filter(
    (d) => d.kind === 'videoinput' && !excluded.includes(normalise(d.label)),
  )

  const candidates = [names.v4l2Name, names.label].map(normalise).filter(Boolean)
  for (const candidate of candidates) {
    const hit = inputs.find((d) => {
      const label = normalise(d.label)
      return label && (label.includes(candidate) || candidate.includes(label))
    })
    if (hit) return hit.deviceId
  }

  // A single input and a single camera is unambiguous enough to use.
  return !options.strict && inputs.length === 1 ? inputs[0].deviceId : undefined
}

/** Labels are only populated once capture permission was granted once. */
export async function labelledDevices(): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  if (devices.every((d) => d.label === '')) {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true })
    probe.getTracks().forEach((track) => track.stop())
    devices = await navigator.mediaDevices.enumerateDevices()
  }
  return devices
}
