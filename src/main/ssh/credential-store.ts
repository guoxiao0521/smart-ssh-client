import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

type CredentialMap = Record<string, string>

let cache: CredentialMap | null = null

function getStorePath(): string {
  return join(app.getPath('userData'), 'credentials.json')
}

function readStore(): CredentialMap {
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

function writeStore(store: CredentialMap): void {
  const storePath = getStorePath()
  const storeDir = dirname(storePath)
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
  cache = store
}

export function getSavedPassword(hostAlias: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore()
  const encrypted = store[hostAlias]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

export function savePassword(hostAlias: string, password: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const store = readStore()
  store[hostAlias] = safeStorage.encryptString(password).toString('base64')
  writeStore(store)
  return true
}

export function deleteSavedPassword(hostAlias: string): void {
  const store = readStore()
  if (!(hostAlias in store)) return
  delete store[hostAlias]
  writeStore(store)
}

export function hasSavedPassword(hostAlias: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const store = readStore()
  return hostAlias in store
}

export function listSavedPasswordHosts(): string[] {
  if (!safeStorage.isEncryptionAvailable()) return []
  return Object.keys(readStore())
}
