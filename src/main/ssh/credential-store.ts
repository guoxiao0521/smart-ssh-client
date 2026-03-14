import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

type CredentialMap = Record<string, string>

function getStorePath(): string {
  return join(app.getPath('userData'), 'credentials.json')
}

function readStore(): CredentialMap {
  const storePath = getStorePath()
  if (!existsSync(storePath)) return {}
  try {
    return JSON.parse(readFileSync(storePath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeStore(store: CredentialMap): void {
  const storePath = getStorePath()
  const storeDir = dirname(storePath)
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
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
