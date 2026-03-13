import { ipcMain, BrowserWindow, dialog } from 'electron'
import { basename } from 'path'
import { parseSshConfig } from './config-parser'
import {
  connect,
  disconnect,
  listDir,
  readFile,
  uploadFile,
  createPty,
  resizePty,
  inputPty,
  closePty
} from './connection-manager'

export function registerIpcHandlers(): void {
  ipcMain.handle('ssh:get-config', () => {
    return parseSshConfig()
  })

  ipcMain.handle('ssh:connect', async (_event, { hostAlias, password }) => {
    const hosts = parseSshConfig()
    const hostConfig = hosts.find((h) => h.alias === hostAlias)
    if (!hostConfig) throw new Error(`Host not found: ${hostAlias}`)
    return connect(hostConfig, password, hosts)
  })

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
    if (result.canceled || result.filePaths.length === 0) return { uploaded: 0 }

    for (const localPath of result.filePaths) {
      const fileName = basename(localPath)
      const remoteFilePath = remotePath.endsWith('/')
        ? remotePath + fileName
        : remotePath + '/' + fileName
      await uploadFile(connectionId, remoteFilePath, localPath)
    }
    return { uploaded: result.filePaths.length }
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
}
