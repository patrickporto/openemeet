import { app, dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { CustomBackground } from '../../shared/types.js'
import type { BackgroundFile } from '../../shared/ipc.js'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

/** Imported images are copied here so the originals can move or vanish. */
const dir = () => join(app.getPath('userData'), 'backgrounds')

const PREFIX = 'custom:'

/** Maps an id back to a file, refusing anything that escapes the folder. */
function fileFor(id: string): string {
  if (!id.startsWith(PREFIX)) throw new Error('Not a custom background')
  const name = id.slice(PREFIX.length)
  if (!name || name !== basename(name) || !(extname(name).toLowerCase() in MIME)) {
    throw new Error('Invalid background id')
  }
  return join(dir(), name)
}

export async function listBackgrounds(): Promise<CustomBackground[]> {
  let names: string[]
  try {
    names = await readdir(dir())
  } catch {
    return []
  }

  const entries = await Promise.all(
    names
      .filter((name) => extname(name).toLowerCase() in MIME)
      .map(async (name) => ({ name, mtime: (await stat(join(dir(), name))).mtimeMs })),
  )
  return entries
    .sort((a, b) => a.mtime - b.mtime)
    .map(({ name }) => ({ id: `${PREFIX}${name}`, name }))
}

export async function addBackground(parent: BrowserWindow | null): Promise<CustomBackground | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: Object.keys(MIME).map((ext) => ext.slice(1)) }],
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const source = result.filePaths[0]
  if (result.canceled || !source) return null

  const ext = extname(source).toLowerCase()
  if (!(ext in MIME)) throw new Error('Unsupported image type')

  await mkdir(dir(), { recursive: true })
  const name = `${randomUUID().slice(0, 8)}${ext}`
  await copyFile(source, join(dir(), name))
  return { id: `${PREFIX}${name}`, name }
}

export async function removeBackground(id: string): Promise<void> {
  await rm(fileFor(id), { force: true })
}

export async function readBackground(id: string): Promise<BackgroundFile> {
  const path = fileFor(id)
  const data = await readFile(path)
  return { data: new Uint8Array(data), mime: MIME[extname(path).toLowerCase()] }
}
