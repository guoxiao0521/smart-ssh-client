import { ElectronAPI } from '@electron-toolkit/preload'

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

export type SshPtyAPI = {
  create: (connectionId: string, cols: number, rows: number) => Promise<string>
  input: (ptyId: string, data: string) => void
  resize: (ptyId: string, cols: number, rows: number) => void
  close: (ptyId: string) => void
  onData: (cb: (payload: TerminalDataPayload) => void) => void
  offData: (cb: (payload: TerminalDataPayload) => void) => void
}

export type SshAPI = {
  getConfig: () => Promise<SshHostConfig[]>
  connect: (hostAlias: string, password?: string) => Promise<string>
  disconnect: (connectionId: string) => Promise<void>
  listDir: (connectionId: string, path: string) => Promise<FileEntry[]>
  readFile: (connectionId: string, path: string) => Promise<FileContent>
  pty: SshPtyAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    ssh: SshAPI
  }
}
