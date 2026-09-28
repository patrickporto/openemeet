import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Minimal persistent JSON store. Writes atomically (tmp + rename) so a crash
 * mid-write cannot leave a truncated config behind.
 */
export class JsonStore<T extends object> {
  private readonly path: string
  private data: T

  constructor(fileName: string, private readonly defaults: T) {
    this.path = join(app.getPath('userData'), fileName)
    this.data = this.read()
  }

  private read(): T {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<T>
      return { ...this.defaults, ...parsed }
    } catch {
      return { ...this.defaults }
    }
  }

  private flush(): void {
    const tmp = `${this.path}.tmp`
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    renameSync(tmp, this.path)
  }

  get all(): T {
    return this.data
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.flush()
  }

  patch(values: Partial<T>): T {
    this.data = { ...this.data, ...values }
    this.flush()
    return this.data
  }
}
