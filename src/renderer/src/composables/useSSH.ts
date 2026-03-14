import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SshHostConfig, ConnectResult, HostMutationInput } from '../types'

export interface ActiveConnection {
  id: string
  alias: string
}

export interface PreviewFile {
  connectionId: string
  path: string
}

export interface UseSSHStore {
  hosts: Ref<SshHostConfig[]>
  activeConnection: Ref<ActiveConnection | null>
  previewFile: Ref<PreviewFile | null>
  loadHosts: () => Promise<void>
  connectHost: (alias: string, password?: string) => Promise<ConnectResult>
  disconnectHost: () => Promise<void>
  createHost: (input: HostMutationInput) => Promise<void>
  updateHost: (originalAlias: string, input: HostMutationInput) => Promise<void>
  deleteHost: (alias: string) => Promise<void>
  setPreviewFile: (connectionId: string, path: string) => void
}

const hosts = ref<SshHostConfig[]>([])
const activeConnection = ref<ActiveConnection | null>(null)
const previewFile = ref<PreviewFile | null>(null)

export function useSSH(): UseSSHStore {
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

  async function createHost(input: HostMutationInput): Promise<void> {
    hosts.value = await window.ssh.createHost(input)
  }

  async function updateHost(originalAlias: string, input: HostMutationInput): Promise<void> {
    hosts.value = await window.ssh.updateHost(originalAlias, input)
    if (activeConnection.value?.alias === originalAlias && originalAlias !== input.alias) {
      activeConnection.value = { ...activeConnection.value, alias: input.alias }
    }
  }

  async function deleteHost(alias: string): Promise<void> {
    if (activeConnection.value?.alias === alias) {
      await disconnectHost()
    }
    hosts.value = await window.ssh.deleteHost(alias)
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
    createHost,
    updateHost,
    deleteHost,
    setPreviewFile
  }
}
