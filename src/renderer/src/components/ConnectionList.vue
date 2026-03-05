<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSSH } from '../composables/useSSH'
import type { SshHostConfig } from '../types'

const { hosts, activeConnection, loadHosts, connectHost, disconnectHost } = useSSH()

const connecting = ref<string | null>(null)
const error = ref<string | null>(null)
const showPasswordDialog = ref(false)
const pendingHost = ref<SshHostConfig | null>(null)
const passwordInput = ref('')

onMounted(loadHosts)

async function handleHostClick(host: SshHostConfig): Promise<void> {
  if (activeConnection.value?.alias === host.alias) return
  error.value = null
  pendingHost.value = host
  await tryConnect(host)
}

async function tryConnect(host: SshHostConfig, password?: string): Promise<void> {
  connecting.value = host.alias
  error.value = null
  try {
    await connectHost(host.alias, password)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      !password &&
      (msg.includes('All configured') ||
        msg.includes('authentication') ||
        msg.includes('No auth') ||
        msg.includes('Failed to connect to agent'))
    ) {
      showPasswordDialog.value = true
    } else {
      error.value = msg
    }
  } finally {
    if (!showPasswordDialog.value) connecting.value = null
  }
}

async function confirmPassword(): Promise<void> {
  if (!pendingHost.value) return
  showPasswordDialog.value = false
  const pw = passwordInput.value
  passwordInput.value = ''
  await tryConnect(pendingHost.value, pw)
}

function cancelPassword(): void {
  showPasswordDialog.value = false
  passwordInput.value = ''
  connecting.value = null
  pendingHost.value = null
}

async function handleDisconnect(): Promise<void> {
  await disconnectHost()
}
</script>

<template>
  <div class="connection-list">
    <div class="section-header">
      <div class="header-left">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="header-icon"
        >
          <rect x="2" y="2" width="20" height="8" rx="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
        <span class="section-title">SSH Hosts</span>
      </div>
      <button class="icon-btn" title="Reload hosts" @click="loadHosts">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </button>
    </div>

    <div v-if="error" class="error-msg">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="error-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {{ error }}
    </div>

    <ul class="host-list">
      <li
        v-for="host in hosts"
        :key="host.alias"
        :class="['host-item', { active: activeConnection?.alias === host.alias }]"
        @click="handleHostClick(host)"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="host-server-icon"
        >
          <rect x="2" y="2" width="20" height="8" rx="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
        <span class="host-info">
          <span class="host-alias">{{ host.alias }}</span>
          <span class="host-detail">{{ host.user ? host.user + '@' : '' }}{{ host.host }}:{{ host.port }}</span>
        </span>
        <span v-if="connecting === host.alias" class="status-dot connecting" title="Connecting..." />
        <span v-else-if="activeConnection?.alias === host.alias" class="status-dot connected" title="Connected" />
      </li>
    </ul>

    <div v-if="hosts.length === 0" class="empty-msg">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="empty-icon"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
      <span>No hosts in ~/.ssh/config</span>
    </div>

    <div v-if="activeConnection" class="active-info">
      <div class="active-info-left">
        <span class="status-dot connected" />
        <span class="active-label">{{ activeConnection.alias }}</span>
      </div>
      <button class="disconnect-btn" title="Disconnect" @click="handleDisconnect">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
        Disconnect
      </button>
    </div>

    <div v-if="showPasswordDialog" class="dialog-overlay" @click.self="cancelPassword">
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-title-row">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="dialog-title-icon"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span class="dialog-title">Authentication Required</span>
          </div>
          <button class="dialog-close-btn" @click="cancelPassword">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <div class="host-badge">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            {{ pendingHost?.alias }}
          </div>
          <div class="input-group">
            <label class="input-label">Password</label>
            <input
              v-model="passwordInput"
              type="password"
              placeholder="Enter password..."
              class="pw-input"
              autofocus
              @keydown.enter="confirmPassword"
              @keydown.esc="cancelPassword"
            />
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelPassword">Cancel</button>
          <button class="btn-ok" @click="confirmPassword">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Connect
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connection-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  height: 34px;
  flex-shrink: 0;
  background: var(--color-panel-header);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.icon-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition),
    color var(--transition);
}
.icon-btn:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}

.host-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  flex: 1;
}

.host-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 5px;
  margin: 1px 6px;
  transition: background var(--transition);
  position: relative;
}
.host-item:hover {
  background: var(--color-hover);
}
.host-item.active {
  background: var(--color-active);
}
.host-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--color-accent);
  border-radius: 0 2px 2px 0;
  margin-left: -6px;
}

.host-server-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color var(--transition);
}
.host-item.active .host-server-icon {
  color: var(--color-accent-light);
}

.host-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 1px;
}
.host-alias {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.host-item.active .host-alias {
  color: var(--color-accent-hover);
}
.host-detail {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.status-dot.connecting {
  background: var(--color-warning);
  box-shadow: 0 0 0 0 var(--color-warning-glow);
  animation: pulse-warning 1.2s ease-out infinite;
}
.status-dot.connected {
  background: var(--color-success);
  box-shadow: 0 0 4px var(--color-success-glow);
}

@keyframes pulse-warning {
  0% { box-shadow: 0 0 0 0 var(--color-warning-glow); }
  70% { box-shadow: 0 0 0 5px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.empty-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
}
.empty-icon {
  opacity: 0.35;
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 6px 8px;
  padding: 7px 10px;
  background: var(--color-error-subtle);
  border: 1px solid var(--color-error-border);
  border-radius: 5px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
  word-break: break-word;
}
.error-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.active-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--color-border);
  background: var(--color-active);
  flex-shrink: 0;
}
.active-info-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.active-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-success);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disconnect-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition);
}
.disconnect-btn:hover {
  background: var(--color-error-subtle);
  border-color: var(--color-error-border);
  color: var(--color-error);
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--color-panel-header);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 340px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-title-icon {
  color: var(--color-accent);
}

.dialog-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.dialog-close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition),
    color var(--transition);
}
.dialog-close-btn:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}

.dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.host-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  align-self: flex-start;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pw-input {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 7px 11px;
  border-radius: 5px;
  font-size: 13px;
  font-family: var(--font-mono);
  outline: none;
  transition: border-color var(--transition);
}
.pw-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}
.pw-input::placeholder {
  color: var(--color-text-muted);
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.15);
}

.btn-cancel,
.btn-ok {
  padding: 6px 14px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition);
}

.btn-cancel {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.btn-cancel:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}

.btn-ok {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--color-accent);
  border: 1px solid transparent;
  color: #fff;
}
.btn-ok:hover {
  background: var(--color-accent-hover);
}
</style>
