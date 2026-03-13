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

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  loading: boolean
}
