import { closeSync, constants, openSync, readSync, writeSync, accessSync } from 'node:fs'
import { HID_QUERY_TIMEOUT_MS, HID_REPORT_SIZE } from '../../shared/protocol.js'

export class HidError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function toReport(bytes: number[]): Buffer {
  if (bytes.length > HID_REPORT_SIZE) {
    throw new HidError(`HID report is longer than ${HID_REPORT_SIZE} bytes`)
  }
  const buf = Buffer.alloc(HID_REPORT_SIZE)
  Buffer.from(bytes).copy(buf)
  return buf
}

export function checkAccess(path: string): { readable: boolean; writable: boolean } {
  const probe = (mode: number) => {
    try {
      accessSync(path, mode)
      return true
    } catch {
      return false
    }
  }
  return { readable: probe(constants.R_OK), writable: probe(constants.W_OK) }
}

/** Fire-and-forget report write. Used for the set/commit pairs. */
export function sendReport(path: string, bytes: number[]): void {
  const report = toReport(bytes)
  let fd: number
  try {
    fd = openSync(path, constants.O_WRONLY)
  } catch (err) {
    throw new HidError(`Cannot open ${path}: ${(err as Error).message}`)
  }
  try {
    writeSync(fd, report)
  } catch (err) {
    throw new HidError(`Failed writing HID report to ${path}: ${(err as Error).message}`)
  } finally {
    closeSync(fd)
  }
}

function isAgain(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EAGAIN' || code === 'EWOULDBLOCK'
}

/** Discards buffered reports so a query reads its own response, not a stale one. */
function drain(fd: number): void {
  const scratch = Buffer.alloc(64)
  for (;;) {
    try {
      if (readSync(fd, scratch, 0, scratch.length, null) <= 0) return
    } catch (err) {
      if (isAgain(err)) return
      throw err
    }
  }
}

/**
 * Writes a report and waits for the camera's reply on the same fd.
 * The device answers asynchronously, so we poll the non-blocking fd.
 */
export async function queryReport(
  path: string,
  bytes: number[],
  timeoutMs = HID_QUERY_TIMEOUT_MS,
): Promise<Buffer> {
  const report = toReport(bytes)
  let fd: number
  try {
    fd = openSync(path, constants.O_RDWR | constants.O_NONBLOCK)
  } catch (err) {
    throw new HidError(`Cannot open ${path}: ${(err as Error).message}`)
  }

  try {
    drain(fd)
    writeSync(fd, report)

    const scratch = Buffer.alloc(64)
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      try {
        const bytesRead = readSync(fd, scratch, 0, scratch.length, null)
        if (bytesRead > 0) return Buffer.from(scratch.subarray(0, bytesRead))
      } catch (err) {
        if (!isAgain(err)) {
          throw new HidError(`Failed reading from ${path}: ${(err as Error).message}`)
        }
      }
      await sleep(25)
    }
  } finally {
    closeSync(fd)
  }

  throw new HidError(`No HID response from ${path}`)
}
