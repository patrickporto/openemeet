/**
 * EMEET PIXY proprietary HID protocol.
 *
 * Reports are 32 bytes, zero-padded. Byte layout observed from the reference
 * implementation (Emeet_pixy_for_linux): [0x09, feature, ...selector, payload].
 * A "set" write is followed ~200ms later by a shorter "commit" write.
 */

export const HID_REPORT_SIZE = 32
export const HID_COMMIT_DELAY_MS = 200
export const HID_QUERY_TIMEOUT_MS = 750

export const TRACKING_MODE = { idle: 0x00, track: 0x01, privacy: 0x02 } as const
export const GESTURE_MODE = { off: 0x00, on: 0x01 } as const
export const AUDIO_MODE = { nc: 0x01, live: 0x02, org: 0x03 } as const

/** Anti-flicker maps onto the standard UVC power_line_frequency control. */
export const FLICKER_MODE = { off: 0, '50': 1, '60': 2 } as const

export const HID = {
  setTracking: (mode: number) => [0x09, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, mode],
  commitTracking: () => [0x09, 0x01, 0x01, 0x01],

  setGesture: (mode: number) => [0x09, 0x04, 0x02, 0x00, 0x00, 0x02, 0x00, 0x02, 0x02, mode],
  commitGesture: () => [0x09, 0x04, 0x02, 0x01, 0x00, 0x01, 0x00, 0x01, 0x02],

  setAudio: (mode: number) => [0x09, 0x05, 0x00, 0x03, 0x00, 0x01, 0x00, 0x01, mode],
  queryAudio: () => [0x09, 0x05, 0x00, 0x04],
  /** Byte index of the audio mode in the query response. */
  AUDIO_RESPONSE_OFFSET: 8,

  setAutoPrivacy: (seconds: number) => [0x09, 0x02, 0x01, 0x00, 0x00, 0x04, 0x00, 0x04, seconds],
  commitAutoPrivacy: () => [0x09, 0x02, 0x01, 0x01],
} as const

/** UVC PTZ ranges. Pan/tilt are in arc-seconds (degrees * 3600). */
export const ARCSEC_PER_DEGREE = 3600
export const PTZ_LIMITS = {
  pan_absolute: { min: -540000, max: 540000 },
  tilt_absolute: { min: -324000, max: 324000 },
  zoom_absolute: { min: 100, max: 150 },
} as const

export const PTZ_CONTROLS = ['pan_absolute', 'tilt_absolute', 'zoom_absolute'] as const
