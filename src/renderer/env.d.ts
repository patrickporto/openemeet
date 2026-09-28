/// <reference types="vite/client" />

import type { OpenemeetApi } from '../shared/ipc'

declare global {
  interface Window {
    openemeet: OpenemeetApi
  }
}

export {}
