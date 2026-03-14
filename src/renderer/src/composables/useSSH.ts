import { ref } from 'vue'
import type { SshHostConfig, ConnectResult } from '../types'

export interface ActiveConnection {
  id: string
  alias: string
}

export interface PreviewFile {
  connectionId: string
  path: string
}

const hosts = ref<SshHostConfig[]>([])
const activeConnection = ref<ActiveConnection | null>(null)
const previewFile = ref<PreviewFile | null>(null)

export function useSSH() {
  async function loadHosts(): Promise<void> {
    if (!window.ssh) {
      hosts.value = []
      return
    }
    try {
      hosts.value = await window.ssh.getConfig()
    } catch (err) {
      console.error('Failed to load SSH config:', err)
      hosts.value = []
    }
  }

  async function connectHost(alias: string, password?: string): Promise<ConnectResult> {
    const result = await window.ssh.connect(alias, password)
    if (result.ok) {
      activeConnection.value = { id: result.connectionId, alias }
    }
    return result
  }

  async function disconnectHost(): Promise<void> {
    if (!activeConnection.value) return
    await window.ssh.disconnect(activeConnection.value.id)
    activeConnection.value = null
    previewFile.value = null
  }

  function setPreviewFile(connectionId: string, path: string): void {
    previewFile.value = { connectionId, path }
  }

  return {
    hosts,
    activeConnection,
    previewFile,
    loadHosts,
    connectHost,
    disconnectHost,
    setPreviewFile
  }
}
