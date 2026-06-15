import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

type PathMap = Record<string, string>

let cache: PathMap | null = null

function getStorePath(): string {
  return join(app.getPath('userData'), 'last-paths.json')
}

function readStore(): PathMap {
  if (cache !== null) return cache
  const storePath = getStorePath()
  if (!existsSync(storePath)) {
    cache = {}
    return cache
  }
  try {
    cache = JSON.parse(readFileSync(storePath, 'utf-8'))
    return cache!
  } catch {
    cache = {}
    return cache
  }
}

function writeStore(store: PathMap): void {
  const storePath = getStorePath()
  const storeDir = dirname(storePath)
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
  cache = store
}

export function getLastPath(hostAlias: string): string | null {
  const store = readStore()
  return store[hostAlias] ?? null
}

export function saveLastPath(hostAlias: string, path: string): void {
  const store = readStore()
  store[hostAlias] = path
  writeStore(store)
}

export function deleteLastPath(hostAlias: string): void {
  const store = readStore()
  if (!(hostAlias in store)) return
  delete store[hostAlias]
  writeStore(store)
}

export function renameLastPath(oldAlias: string, newAlias: string): void {
  const store = readStore()
  if (!(oldAlias in store)) return
  store[newAlias] = store[oldAlias]
  delete store[oldAlias]
  writeStore(store)
}
