/// <reference types="vite/client" />

import type { OpenemeetApi, VcamHostApi } from '../shared/ipc'

declare global {
  interface Window {
    openemeet: OpenemeetApi
    /** Only present inside the hidden virtual camera worker. */
    vcamHost: VcamHostApi
  }

  /** Insertable Streams: pulls VideoFrames from a track, even in a hidden window. */
  class MediaStreamTrackProcessor<T = VideoFrame> {
    constructor(init: { track: MediaStreamTrack; maxBufferSize?: number })
    readonly readable: ReadableStream<T>
  }
}

export {}
