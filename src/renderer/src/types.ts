// Shared type definitions mirroring src/preload/index.d.ts

export type SshHostConfig = {
  alias: string
  host: string
  port: number
  user: string
  identityFile?: string
  bindAddress?: string
  proxyJump?: string
}

export type HostMutationInput = {
  alias: string
  host: string
  port?: number
  user?: string
  identityFile?: string
  bindAddress?: string
  proxyJump?: string
}

export type FileEntry = {
  filename: string
  longname: string
  isDirectory: boolean
  size: number
  mtime: number
}

export type FileContent = {
  text?: string
  base64?: string
  mimeType: string
  size: number
  error?: string
}

export type TerminalDataPayload = { id: string; data: string }
export type DownloadResult = { canceled: boolean; savedPath?: string }

export type ConnectionErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'HOST_KEY_ERROR'
  | 'UNKNOWN'

export type ConnectionError = { code: ConnectionErrorCode; message: string }
export type ConnectResult =
  | { ok: true; connectionId: string }
  | { ok: false; error: ConnectionError; usedSavedPassword: boolean }

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  loading: boolean
}
