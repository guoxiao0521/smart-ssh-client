import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type {
  SshHostConfig,
  ConnectResult,
  HostMutationInput,
  ConnectionSession
} from '../types'

export interface UseSSHStore {
  hosts: Ref<SshHostConfig[]>
  sessions: Ref<ConnectionSession[]>
  activeSessionId: Ref<string | null>
  activeSession: ComputedRef<ConnectionSession | null>
  loadHosts: () => Promise<void>
  connectHost: (alias: string, password?: string) => Promise<ConnectResult>
  activateSession: (connectionId: string) => void
  disconnectHost: (connectionId?: string) => Promise<void>
  createHost: (input: HostMutationInput) => Promise<void>
  updateHost: (originalAlias: string, input: HostMutationInput) => Promise<void>
  deleteHost: (alias: string) => Promise<void>
}

const hosts = ref<SshHostConfig[]>([])
const sessions = ref<ConnectionSession[]>([])
const activeSessionId = ref<string | null>(null)
const activeSession = computed<ConnectionSession | null>(() => {
  if (!activeSessionId.value) return null
  return sessions.value.find((session) => session.id === activeSessionId.value) ?? null
})

export function useSSH(): UseSSHStore {
  function activateSession(connectionId: string): void {
    const hasSession = sessions.value.some((session) => session.id === connectionId)
    if (hasSession) {
      activeSessionId.value = connectionId
    }
  }

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
    const existingSession = sessions.value.find((session) => session.alias === alias)
    if (existingSession) {
      activeSessionId.value = existingSession.id
      return { ok: true, connectionId: existingSession.id }
    }

    const result = await window.ssh.connect(alias, password)
    if (result.ok) {
      const newSession = { id: result.connectionId, alias }
      sessions.value = [...sessions.value, newSession]
      activeSessionId.value = newSession.id
    }
    return result
  }

  async function disconnectHost(connectionId?: string): Promise<void> {
    const targetConnectionId = connectionId ?? activeSessionId.value
    if (!targetConnectionId) return

    await window.ssh.disconnect(targetConnectionId)

    sessions.value = sessions.value.filter((session) => session.id !== targetConnectionId)

    if (activeSessionId.value === targetConnectionId) {
      const lastSession = sessions.value[sessions.value.length - 1]
      activeSessionId.value = lastSession?.id ?? null
    }
  }

  async function createHost(input: HostMutationInput): Promise<void> {
    hosts.value = await window.ssh.createHost(input)
  }

  async function updateHost(originalAlias: string, input: HostMutationInput): Promise<void> {
    hosts.value = await window.ssh.updateHost(originalAlias, input)
    if (originalAlias !== input.alias) {
      sessions.value = sessions.value.map((session) =>
        session.alias === originalAlias ? { ...session, alias: input.alias } : session
      )
    }
  }

  async function deleteHost(alias: string): Promise<void> {
    const sessionIdsByAlias = sessions.value
      .filter((session) => session.alias === alias)
      .map((session) => session.id)
    for (const connectionId of sessionIdsByAlias) {
      await disconnectHost(connectionId)
    }
    hosts.value = await window.ssh.deleteHost(alias)
  }

  return {
    hosts,
    sessions,
    activeSessionId,
    activeSession,
    loadHosts,
    connectHost,
    activateSession,
    disconnectHost,
    createHost,
    updateHost,
    deleteHost
  }
}
