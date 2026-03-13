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

const sshAPI = {
  getConfig: (): Promise<SshHostConfig[]> => ipcRenderer.invoke('ssh:get-config'),
  connect: (hostAlias: string, password?: string): Promise<string> =>
    ipcRenderer.invoke('ssh:connect', { hostAlias, password }),
  disconnect: (connectionId: string): Promise<void> =>
    ipcRenderer.invoke('ssh:disconnect', connectionId),
  listDir: (connectionId: string, path: string): Promise<FileEntry[]> =>
    ipcRenderer.invoke('ssh:list-dir', { connectionId, path }),
  readFile: (connectionId: string, path: string): Promise<FileContent> =>
    ipcRenderer.invoke('ssh:read-file', { connectionId, path }),
  uploadFile: (connectionId: string, remotePath: string): Promise<UploadResult> =>
    ipcRenderer.invoke('ssh:upload-file', { connectionId, remotePath }),
  deleteFile: (connectionId: string, path: string): Promise<void> =>
    ipcRenderer.invoke('ssh:delete-file', { connectionId, path }),
  pty: {
    create: (connectionId: string, cols: number, rows: number): Promise<string> =>
      ipcRenderer.invoke('ssh:pty-create', { connectionId, cols, rows }),
    input: (ptyId: string, data: string): void =>
      ipcRenderer.send('ssh:pty-input', { ptyId, data }),
    resize: (ptyId: string, cols: number, rows: number): void =>
      ipcRenderer.send('ssh:pty-resize', { ptyId, cols, rows }),
    close: (ptyId: string): void => ipcRenderer.send('ssh:pty-close', ptyId),
    onData: (cb: (payload: TerminalDataPayload) => void): void => {
      ipcRenderer.on('ssh:terminal-data', (_event, payload) => cb(payload))
    },
    offData: (cb: (payload: TerminalDataPayload) => void): void => {
      ipcRenderer.removeAllListeners('ssh:terminal-data')
      void cb
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
