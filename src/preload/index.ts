import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
export type UploadResult = { uploaded: number; uploadedPaths: string[] }
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

const ptyDataListenerMap = new WeakMap<
  (payload: TerminalDataPayload) => void,
  (_event: unknown, payload: TerminalDataPayload) => void
>()

const sshAPI = {
  getConfig: (): Promise<SshHostConfig[]> => ipcRenderer.invoke('ssh:get-config'),
  createHost: (hostConfig: HostMutationInput): Promise<SshHostConfig[]> =>
    ipcRenderer.invoke('ssh:create-host', hostConfig),
  updateHost: (originalAlias: string, hostConfig: HostMutationInput): Promise<SshHostConfig[]> =>
    ipcRenderer.invoke('ssh:update-host', { originalAlias, hostConfig }),
  deleteHost: (alias: string): Promise<SshHostConfig[]> => ipcRenderer.invoke('ssh:delete-host', alias),
  connect: (hostAlias: string, password?: string): Promise<ConnectResult> =>
    ipcRenderer.invoke('ssh:connect', { hostAlias, password }),
  disconnect: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke('ssh:disconnect', connectionId),
  listDir: (connectionId: string, path: string): Promise<FileEntry[]> =>
    ipcRenderer.invoke('ssh:list-dir', { connectionId, path }),
  readFile: (connectionId: string, path: string): Promise<FileContent> =>
    ipcRenderer.invoke('ssh:read-file', { connectionId, path }),
  uploadFile: (connectionId: string, remotePath: string): Promise<UploadResult> =>
    ipcRenderer.invoke('ssh:upload-file', { connectionId, remotePath }),
  downloadFile: (connectionId: string, remotePath: string): Promise<DownloadResult> =>
    ipcRenderer.invoke('ssh:download-file', { connectionId, remotePath }),
  deleteFile: (connectionId: string, path: string): Promise<void> =>
    ipcRenderer.invoke('ssh:delete-file', { connectionId, path }),
  hasSavedPassword: (hostAlias: string): Promise<boolean> =>
    ipcRenderer.invoke('ssh:has-saved-password', hostAlias),
  listSavedPasswordHosts: (): Promise<string[]> =>
    ipcRenderer.invoke('ssh:list-saved-password-hosts'),
  savePassword: (hostAlias: string, password: string): Promise<boolean> =>
    ipcRenderer.invoke('ssh:save-password', { hostAlias, password }),
  deleteSavedPassword: (hostAlias: string): Promise<void> =>
    ipcRenderer.invoke('ssh:delete-saved-password', hostAlias),
  pty: {
    create: (connectionId: string, cols: number, rows: number): Promise<string> =>
      ipcRenderer.invoke('ssh:pty-create', { connectionId, cols, rows }),
    input: (ptyId: string, data: string): void =>
      ipcRenderer.send('ssh:pty-input', { ptyId, data }),
    resize: (ptyId: string, cols: number, rows: number): void =>
      ipcRenderer.send('ssh:pty-resize', { ptyId, cols, rows }),
    close: (ptyId: string): void => ipcRenderer.send('ssh:pty-close', ptyId),
    onData: (cb: (payload: TerminalDataPayload) => void): void => {
      const listener = (_event: unknown, payload: TerminalDataPayload): void => {
        cb(payload)
      }
      ptyDataListenerMap.set(cb, listener)
      ipcRenderer.on('ssh:terminal-data', listener)
    },
    offData: (cb: (payload: TerminalDataPayload) => void): void => {
      const listener = ptyDataListenerMap.get(cb)
      if (!listener) return
      ipcRenderer.removeListener('ssh:terminal-data', listener)
      ptyDataListenerMap.delete(cb)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('ssh', sshAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.ssh = sshAPI
}
