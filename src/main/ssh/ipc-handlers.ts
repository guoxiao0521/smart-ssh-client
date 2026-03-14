import { ipcMain, BrowserWindow, dialog } from 'electron'
import { basename } from 'path'
import { parseSshConfig } from './config-parser'
import {
  connect,
  disconnect,
  listDir,
  readFile,
  uploadFile,
  downloadFile,
  deleteFile,
  createPty,
  resizePty,
  inputPty,
  closePty
} from './connection-manager'
import {
  getSavedPassword,
  savePassword,
  deleteSavedPassword,
  hasSavedPassword,
  listSavedPasswordHosts
} from './credential-store'

type ConnectResultWithSavedFlag =
  | { ok: true; connectionId: string }
  | { ok: false; error: { code: string; message: string }; usedSavedPassword: boolean }

export function registerIpcHandlers(): void {
  ipcMain.handle('ssh:get-config', () => {
    return parseSshConfig()
  })

  ipcMain.handle(
    'ssh:connect',
    async (_event, { hostAlias, password }): Promise<ConnectResultWithSavedFlag> => {
      try {
        const hosts = parseSshConfig()
        const hostConfig = hosts.find((h) => h.alias === hostAlias)
        if (!hostConfig) {
          return {
            ok: false,
            error: { code: 'UNKNOWN', message: `Host not found: ${hostAlias}` },
            usedSavedPassword: false
          }
        }
        const usedSavedPassword = password === undefined && hasSavedPassword(hostAlias)
        const effectivePassword =
          password !== undefined
            ? password
            : usedSavedPassword
              ? getSavedPassword(hostAlias) ?? undefined
              : undefined
        const result = await connect(hostConfig, effectivePassword, hosts)
        if (result.ok) return result
        return { ...result, usedSavedPassword }
      } catch (e) {
        return {
          ok: false,
          error: { code: 'UNKNOWN', message: e instanceof Error ? e.message : 'Connection failed' },
          usedSavedPassword: false
        }
      }
    }
  )

  ipcMain.handle('ssh:disconnect', (_event, connectionId: string) => {
    disconnect(connectionId)
  })

  ipcMain.handle('ssh:list-dir', async (_event, { connectionId, path }) => {
    return listDir(connectionId, path)
  })

  ipcMain.handle('ssh:read-file', async (_event, { connectionId, path }) => {
    return readFile(connectionId, path)
  })

  ipcMain.handle('ssh:upload-file', async (event, { connectionId, remotePath }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { uploaded: 0, uploadedPaths: [] }
    }

    const uploadedPaths: string[] = []

    for (const localPath of result.filePaths) {
      const fileName = basename(localPath)
      const remoteFilePath = remotePath.endsWith('/')
        ? remotePath + fileName
        : remotePath + '/' + fileName
      await uploadFile(connectionId, remoteFilePath, localPath)
      uploadedPaths.push(remoteFilePath)
    }
    return { uploaded: uploadedPaths.length, uploadedPaths }
  })

  ipcMain.handle('ssh:download-file', async (event, { connectionId, remotePath }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const saveResult = await dialog.showSaveDialog(win!, {
      defaultPath: basename(remotePath)
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true }
    }

    await downloadFile(connectionId, remotePath, saveResult.filePath)
    return { canceled: false, savedPath: saveResult.filePath }
  })

  ipcMain.handle('ssh:delete-file', async (_event, { connectionId, path }) => {
    return deleteFile(connectionId, path)
  })

  ipcMain.handle('ssh:pty-create', async (event, { connectionId, cols, rows }) => {
    return createPty(connectionId, event.sender, cols, rows)
  })

  ipcMain.on('ssh:pty-input', (_event, { ptyId, data }) => {
    inputPty(ptyId, data)
  })

  ipcMain.on('ssh:pty-resize', (_event, { ptyId, cols, rows }) => {
    resizePty(ptyId, cols, rows)
  })

  ipcMain.on('ssh:pty-close', (_event, ptyId: string) => {
    closePty(ptyId)
  })

  ipcMain.handle('ssh:has-saved-password', (_event, hostAlias: string) => {
    return hasSavedPassword(hostAlias)
  })

  ipcMain.handle('ssh:list-saved-password-hosts', () => {
    return listSavedPasswordHosts()
  })

  ipcMain.handle('ssh:save-password', (_event, { hostAlias, password }) => {
    return savePassword(hostAlias, password)
  })

  ipcMain.handle('ssh:delete-saved-password', (_event, hostAlias: string) => {
    deleteSavedPassword(hostAlias)
  })
}
