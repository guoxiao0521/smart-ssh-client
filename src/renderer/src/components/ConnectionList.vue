<script setup lang="ts">
import {
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Power,
  Server,
  X
} from 'lucide-vue-next'
import { onMounted, ref, reactive } from 'vue'
import { useSSH } from '../composables/useSSH'
import type { SshHostConfig } from '../types'

const { hosts, activeConnection, loadHosts, connectHost, disconnectHost } = useSSH()

const connecting = ref<string | null>(null)
const error = ref<string | null>(null)
const showPasswordDialog = ref(false)
const showPassword = ref(false)
const pendingHost = ref<SshHostConfig | null>(null)
const passwordInput = ref('')
const passwordError = ref<string | null>(null)
const rememberPassword = ref(false)
const savedPasswordHosts = reactive(new Set<string>())

onMounted(async () => {
  await loadHosts()
  await refreshSavedPasswordFlags()
})

async function refreshSavedPasswordFlags(): Promise<void> {
  savedPasswordHosts.clear()
  for (const host of hosts.value) {
    if (await window.ssh.hasSavedPassword(host.alias)) {
      savedPasswordHosts.add(host.alias)
    }
  }
}

async function handleHostClick(host: SshHostConfig): Promise<void> {
  if (activeConnection.value?.alias === host.alias) return
  error.value = null
  pendingHost.value = host
  await tryConnect(host)
}

async function tryConnect(
  host: SshHostConfig,
  password?: string,
  shouldRemember = false
): Promise<void> {
  connecting.value = host.alias
  error.value = null

  let result: Awaited<ReturnType<typeof connectHost>>
  try {
    result = await connectHost(host.alias, password)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Connection failed'
    connecting.value = null
    return
  }

  if (result.ok) {
    if (shouldRemember && password) {
      const saved = await window.ssh.savePassword(host.alias, password)
      if (saved) savedPasswordHosts.add(host.alias)
    }
    connecting.value = null
    return
  }

  const { code, message } = result.error

  if (code === 'AUTH_REQUIRED' || code === 'AUTH_FAILED') {
    if (result.usedSavedPassword) {
      await window.ssh.deleteSavedPassword(host.alias)
      savedPasswordHosts.delete(host.alias)
      passwordError.value = 'Saved password is incorrect. Please enter a new password.'
    } else {
      passwordError.value = code === 'AUTH_FAILED' ? message : null
    }
    showPasswordDialog.value = true
    return
  }

  error.value = message
  connecting.value = null
}

async function confirmPassword(): Promise<void> {
  if (!pendingHost.value) return
  showPasswordDialog.value = false
  passwordError.value = null
  const pw = passwordInput.value
  passwordInput.value = ''
  const remember = rememberPassword.value
  rememberPassword.value = false

  await tryConnect(pendingHost.value, pw, remember)
}

function cancelPassword(): void {
  showPasswordDialog.value = false
  passwordInput.value = ''
  passwordError.value = null
  showPassword.value = false
  rememberPassword.value = false
  connecting.value = null
  pendingHost.value = null
}

async function clearSavedPassword(event: Event, host: SshHostConfig): Promise<void> {
  event.stopPropagation()
  await window.ssh.deleteSavedPassword(host.alias)
  savedPasswordHosts.delete(host.alias)
}

async function handleDisconnect(): Promise<void> {
  await disconnectHost()
}
</script>

<template>
  <div class="connection-list" role="region" aria-label="SSH connection list">
    <div class="section-header">
      <div class="header-left">
        <Server
          :size="14"
          :stroke-width="2"
          absolute-stroke-width
          class="header-icon"
          aria-hidden="true"
        />
        <span class="section-title">SSH Hosts</span>
      </div>
    </div>

    <div v-if="error" class="error-msg" role="alert" aria-live="assertive">
      <CircleAlert
        :size="14"
        :stroke-width="2"
        absolute-stroke-width
        class="error-icon"
        aria-hidden="true"
      />
      {{ error }}
    </div>

    <ul class="host-list" role="list">
      <li
        v-for="host in hosts"
        :key="host.alias"
        :class="['host-item', { active: activeConnection?.alias === host.alias }]"
        role="button"
        tabindex="0"
        :aria-label="`Connect to ${host.alias}: ${host.user ? host.user + '@' : ''}${host.host}:${host.port}`"
        :aria-pressed="activeConnection?.alias === host.alias"
        @click="handleHostClick(host)"
        @keydown.enter="handleHostClick(host)"
        @keydown.space.prevent="handleHostClick(host)"
      >
        <Server
          :size="14"
          :stroke-width="2"
          absolute-stroke-width
          class="host-server-icon"
          aria-hidden="true"
        />
        <span class="host-info">
          <span class="host-alias">{{ host.alias }}</span>
          <span class="host-detail">{{ host.user ? host.user + '@' : '' }}{{ host.host }}:{{ host.port }}</span>
        </span>
        <button
          v-if="savedPasswordHosts.has(host.alias) && activeConnection?.alias !== host.alias"
          class="saved-pw-btn"
          type="button"
          title="Clear saved password"
          aria-label="Clear saved password"
          @click="clearSavedPassword($event, host)"
        >
          <KeyRound :size="13" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
        </button>
        <span
          v-if="connecting === host.alias"
          class="status-dot connecting"
          role="status"
          aria-label="Connecting"
        />
        <span
          v-else-if="activeConnection?.alias === host.alias"
          class="status-dot connected"
          role="status"
          aria-label="Connected"
        />
      </li>
    </ul>

    <div v-if="hosts.length === 0" class="empty-msg">
      <Server
        :size="24"
        :stroke-width="1.5"
        class="empty-icon"
        aria-hidden="true"
      />
      <span>No hosts in ~/.ssh/config</span>
    </div>

    <div v-if="activeConnection" class="active-info">
      <div class="active-info-left">
        <span class="status-dot connected" />
        <span class="active-label">{{ activeConnection.alias }}</span>
      </div>
      <button
        class="disconnect-btn"
        type="button"
        aria-label="Disconnect"
        title="Disconnect"
        @click="handleDisconnect"
      >
        <Power :size="14" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
        Disconnect
      </button>
    </div>

    <div
      v-if="showPasswordDialog"
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-desc"
      @click.self="cancelPassword"
    >
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-title-row">
            <LockKeyhole
              :size="16"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-title-icon"
              aria-hidden="true"
            />
            <span id="dialog-title" class="dialog-title">Authentication Required</span>
          </div>
          <button
            class="dialog-close-btn"
            type="button"
            aria-label="Close"
            @click="cancelPassword"
          >
            <X :size="14" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
          </button>
        </div>
        <div id="dialog-desc" class="dialog-body">
          <div class="host-badge">
            <Server :size="12" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
            {{ pendingHost?.alias }}
          </div>
          <div v-if="passwordError" class="dialog-error" role="alert">
            <CircleAlert
              :size="13"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-error-icon"
              aria-hidden="true"
            />
            {{ passwordError }}
          </div>
          <div class="input-group">
            <label class="input-label" for="pw-input">Password</label>
            <div class="pw-input-wrapper">
              <input
                id="pw-input"
                v-model="passwordInput"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter password..."
                class="pw-input"
                autocomplete="current-password"
                autofocus
                @keydown.enter="confirmPassword"
                @keydown.esc="cancelPassword"
              />
              <button
                type="button"
                class="pw-toggle"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                @click="showPassword = !showPassword"
              >
                <EyeOff
                  v-if="showPassword"
                  :size="16"
                  :stroke-width="2"
                  absolute-stroke-width
                  aria-hidden="true"
                />
                <Eye
                  v-else
                  :size="16"
                  :stroke-width="2"
                  absolute-stroke-width
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          <label class="remember-label">
            <input
              v-model="rememberPassword"
              type="checkbox"
              class="remember-checkbox"
            />
            <span>Remember password</span>
          </label>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" type="button" @click="cancelPassword">Cancel</button>
          <button class="btn-ok" type="button" @click="confirmPassword">
            <Check :size="14" :stroke-width="2.25" absolute-stroke-width aria-hidden="true" />
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
  padding: 0 12px;
  min-height: 40px;
  flex-shrink: 0;
  background: var(--color-panel-header);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  text-transform: uppercase;
  line-height: 1.5;
}

.host-list {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  overflow-y: auto;
  flex: 1;
}

.host-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  padding-left: 8px;
  min-height: 40px;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px 8px;
  transition: background var(--transition);
  position: relative;
}
.host-item:hover {
  background: var(--color-hover);
}
.host-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.host-item.active {
  background: var(--color-active);
}
.host-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--color-accent);
  border-radius: 0 2px 2px 0;
  margin-left: -8px;
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
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.saved-pw-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-accent-light);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  flex-shrink: 0;
  opacity: 0.6;
  transition:
    opacity var(--transition),
    color var(--transition),
    background var(--transition);
}
.saved-pw-btn:hover {
  opacity: 1;
  color: var(--color-error);
  background: var(--color-error-subtle);
}
.saved-pw-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.status-dot.connecting {
  background: var(--color-warning);
  box-shadow: 0 0 0 0 var(--color-warning-glow);
  animation: pulse-warning 1.2s ease-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .status-dot.connecting {
    animation: none;
    box-shadow: 0 0 4px var(--color-warning-glow);
  }
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
  gap: 12px;
  padding: 24px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  text-align: center;
}
.empty-icon {
  opacity: 0.35;
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px;
  padding: 10px 12px;
  background: var(--color-error-subtle);
  border: 1px solid var(--color-error-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.5;
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
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-active);
  flex-shrink: 0;
}
.active-info-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.active-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-success);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disconnect-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 6px;
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
.disconnect-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--color-panel-header);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 360px;
  max-width: calc(100vw - 32px);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
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
  min-width: 32px;
  min-height: 32px;
  padding: 6px;
  border-radius: 6px;
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
.dialog-close-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--color-error-subtle);
  border: 1px solid var(--color-error-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
}
.dialog-error-icon {
  flex-shrink: 0;
}

.host-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  align-self: flex-start;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.pw-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.pw-input {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 8px 40px 8px 12px;
  min-height: 40px;
  border-radius: 6px;
  font-size: 13px;
  font-family: var(--font-mono);
  width: 100%;
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
.pw-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
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
.pw-toggle:hover {
  color: var(--color-text);
  background: var(--color-hover);
}
.pw-toggle:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.remember-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.remember-label:hover {
  color: var(--color-text);
}
.remember-checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--color-accent);
  cursor: pointer;
  margin: 0;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.12);
}

.btn-cancel,
.btn-ok {
  min-height: 36px;
  padding: 8px 16px;
  border-radius: 6px;
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
.btn-cancel:focus-visible,
.btn-ok:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.btn-ok {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-accent);
  border: 1px solid transparent;
  color: #fff;
}
.btn-ok:hover {
  background: var(--color-accent-hover);
}
</style>
