<script setup lang="ts">
import {
  CheckCheck,
  Check,
  CircleAlert,
  Pencil,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Power,
  Server,
  X
} from 'lucide-vue-next'
import { computed, onMounted, ref, reactive, watch, nextTick } from 'vue'
import { useSSH } from '../composables/useSSH'
import type { HostMutationInput, SshHostConfig } from '../types'

const {
  hosts,
  sessions,
  activeSession,
  loadHosts,
  connectHost,
  activateSession,
  disconnectHost,
  createHost,
  updateHost,
  deleteHost
} = useSSH()

const connecting = ref<string | null>(null)
const error = ref<string | null>(null)
const showPasswordDialog = ref(false)
const showPassword = ref(false)
const pendingHost = ref<SshHostConfig | null>(null)
const passwordInput = ref('')
const passwordError = ref<string | null>(null)
const rememberPassword = ref(false)
const savedPasswordHosts = reactive(new Set<string>())

const showHostDialog = ref(false)
const hostDialogMode = ref<'create' | 'edit'>('create')
const hostDialogError = ref<string | null>(null)
const editingOriginalAlias = ref<string>('')
const hostForm = reactive<Required<HostMutationInput>>({
  alias: '',
  host: '',
  port: 22,
  user: '',
  identityFile: '',
  bindAddress: '',
  proxyJump: ''
})

const showDeleteDialog = ref(false)
const deletingHostAlias = ref('')
const deleteDialogError = ref<string | null>(null)

const passwordDialogRef = ref<HTMLElement | null>(null)
const hostDialogRef = ref<HTMLElement | null>(null)
const deleteDialogRef = ref<HTMLElement | null>(null)
const connectedAliases = computed(() => new Set(sessions.value.map((session) => session.alias)))
const connectedHostCount = computed(() => sessions.value.length)

onMounted(async () => {
  await loadHosts()
  await refreshSavedPasswordFlags()
})

watch(showPasswordDialog, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  focusFirstDialogElement(passwordDialogRef.value)
})

watch(showHostDialog, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  focusFirstDialogElement(hostDialogRef.value)
})

watch(showDeleteDialog, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  focusFirstDialogElement(deleteDialogRef.value)
})

async function refreshSavedPasswordFlags(): Promise<void> {
  savedPasswordHosts.clear()
  const saved = await window.ssh.listSavedPasswordHosts()
  for (const alias of saved) {
    savedPasswordHosts.add(alias)
  }
}

async function handleHostClick(host: SshHostConfig): Promise<void> {
  if (activeSession.value?.alias === host.alias) return
  const existingSession = sessions.value.find((session) => session.alias === host.alias)
  if (existingSession) {
    activateSession(existingSession.id)
    return
  }
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

function resetHostForm(): void {
  hostForm.alias = ''
  hostForm.host = ''
  hostForm.port = 22
  hostForm.user = ''
  hostForm.identityFile = ''
  hostForm.bindAddress = ''
  hostForm.proxyJump = ''
}

function openCreateHostDialog(): void {
  resetHostForm()
  editingOriginalAlias.value = ''
  hostDialogMode.value = 'create'
  hostDialogError.value = null
  showHostDialog.value = true
}

function openEditHostDialog(event: Event, host: SshHostConfig): void {
  event.stopPropagation()
  hostDialogMode.value = 'edit'
  editingOriginalAlias.value = host.alias
  hostForm.alias = host.alias
  hostForm.host = host.host
  hostForm.port = host.port ?? 22
  hostForm.user = host.user ?? ''
  hostForm.identityFile = host.identityFile ?? ''
  hostForm.bindAddress = host.bindAddress ?? ''
  hostForm.proxyJump = host.proxyJump ?? ''
  hostDialogError.value = null
  showHostDialog.value = true
}

function closeHostDialog(): void {
  showHostDialog.value = false
  hostDialogError.value = null
}

function findFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'))
}

function focusFirstDialogElement(dialog: HTMLElement | null): void {
  if (!dialog) return
  const focusableElements = findFocusableElements(dialog)
  const target = focusableElements[0] ?? dialog
  target.focus()
}

function handleDialogFocusTrap(
  event: KeyboardEvent,
  dialog: HTMLElement | null,
  closeDialog: () => void
): void {
  if (event.key === 'Escape') {
    closeDialog()
    return
  }
  if (event.key !== 'Tab' || !dialog) return

  const focusableElements = findFocusableElements(dialog)
  if (focusableElements.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement as HTMLElement | null

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
    return
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

function handlePasswordDialogKeydown(event: KeyboardEvent): void {
  handleDialogFocusTrap(event, passwordDialogRef.value, cancelPassword)
}

function handleHostDialogKeydown(event: KeyboardEvent): void {
  handleDialogFocusTrap(event, hostDialogRef.value, closeHostDialog)
}

function handleDeleteDialogKeydown(event: KeyboardEvent): void {
  handleDialogFocusTrap(event, deleteDialogRef.value, closeDeleteHostDialog)
}

function validateHostForm(): HostMutationInput {
  const alias = hostForm.alias.trim()
  const host = hostForm.host.trim()
  const user = hostForm.user.trim()
  const identityFile = hostForm.identityFile.trim()
  const bindAddress = hostForm.bindAddress.trim()
  const proxyJump = hostForm.proxyJump.trim()
  const parsedPort = Number(hostForm.port)

  if (!alias) {
    throw new Error('Alias is required')
  }
  if (!host) {
    throw new Error('HostName is required')
  }
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('Port must be between 1 and 65535')
  }

  return {
    alias,
    host,
    port: parsedPort,
    user,
    identityFile: identityFile || undefined,
    bindAddress: bindAddress || undefined,
    proxyJump: proxyJump || undefined
  }
}

async function submitHostDialog(): Promise<void> {
  hostDialogError.value = null
  try {
    const payload = validateHostForm()
    if (hostDialogMode.value === 'create') {
      await createHost(payload)
    } else {
      const originalAlias = editingOriginalAlias.value
      await updateHost(originalAlias, payload)
      if (originalAlias !== payload.alias && savedPasswordHosts.has(originalAlias)) {
        await window.ssh.deleteSavedPassword(originalAlias)
        savedPasswordHosts.delete(originalAlias)
      }
    }
    closeHostDialog()
  } catch (e) {
    hostDialogError.value = e instanceof Error ? e.message : 'Host operation failed'
  }
}

function openDeleteHostDialog(event: Event, host: SshHostConfig): void {
  event.stopPropagation()
  deletingHostAlias.value = host.alias
  showDeleteDialog.value = true
  deleteDialogError.value = null
}

function closeDeleteHostDialog(): void {
  deletingHostAlias.value = ''
  deleteDialogError.value = null
  showDeleteDialog.value = false
}

async function confirmDeleteHost(): Promise<void> {
  const alias = deletingHostAlias.value
  if (!alias) return
  try {
    await deleteHost(alias)
    if (savedPasswordHosts.has(alias)) {
      await window.ssh.deleteSavedPassword(alias)
      savedPasswordHosts.delete(alias)
    }
    closeDeleteHostDialog()
  } catch (e) {
    deleteDialogError.value = e instanceof Error ? e.message : 'Delete host failed'
  }
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
      <button
        class="add-host-btn"
        type="button"
        aria-label="Add host"
        title="Add host"
        @click="openCreateHostDialog"
      >
        <Plus :size="14" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
      </button>
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
        :class="['host-item', { active: activeSession?.alias === host.alias }]"
        role="button"
        tabindex="0"
        :aria-label="`Connect to ${host.alias}: ${host.user ? host.user + '@' : ''}${host.host}:${host.port}`"
        :aria-pressed="activeSession?.alias === host.alias"
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
          class="host-action-btn"
          type="button"
          aria-label="Edit host"
          title="Edit host"
          @click="openEditHostDialog($event, host)"
        >
          <Pencil :size="13" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
        </button>
        <button
          class="host-action-btn danger"
          type="button"
          aria-label="Delete host"
          title="Delete host"
          @click="openDeleteHostDialog($event, host)"
        >
          <Trash2 :size="13" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
        </button>
        <button
          v-if="savedPasswordHosts.has(host.alias) && !connectedAliases.has(host.alias)"
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
          v-else-if="connectedAliases.has(host.alias)"
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

    <div v-if="activeSession" class="active-info">
      <div class="active-info-left">
        <span class="status-dot connected" />
        <span class="active-label">{{ activeSession.alias }}</span>
        <span class="active-count">({{ connectedHostCount }} 个连接)</span>
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
      @keydown="handlePasswordDialogKeydown"
    >
      <div ref="passwordDialogRef" class="dialog" tabindex="-1">
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

    <div
      v-if="showHostDialog"
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-dialog-title"
      @click.self="closeHostDialog"
      @keydown="handleHostDialogKeydown"
    >
      <div ref="hostDialogRef" class="dialog" tabindex="-1">
        <div class="dialog-header">
          <div class="dialog-title-row">
            <Server
              :size="16"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-title-icon"
              aria-hidden="true"
            />
            <span id="host-dialog-title" class="dialog-title">
              {{ hostDialogMode === 'create' ? 'Add SSH Host' : 'Edit SSH Host' }}
            </span>
          </div>
          <button
            class="dialog-close-btn"
            type="button"
            aria-label="Close"
            @click="closeHostDialog"
          >
            <X :size="14" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
          </button>
        </div>
        <div class="dialog-body host-form">
          <div v-if="hostDialogError" class="dialog-error" role="alert">
            <CircleAlert
              :size="13"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-error-icon"
              aria-hidden="true"
            />
            {{ hostDialogError }}
          </div>
          <div class="input-group">
            <label class="input-label" for="host-alias-input">Alias</label>
            <input id="host-alias-input" v-model="hostForm.alias" class="pw-input" autocomplete="off" />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-name-input">HostName</label>
            <input id="host-name-input" v-model="hostForm.host" class="pw-input" autocomplete="off" />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-port-input">Port</label>
            <input id="host-port-input" v-model.number="hostForm.port" class="pw-input" type="number" min="1" max="65535" />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-user-input">User</label>
            <input id="host-user-input" v-model="hostForm.user" class="pw-input" autocomplete="off" />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-identity-file-input">IdentityFile</label>
            <input
              id="host-identity-file-input"
              v-model="hostForm.identityFile"
              class="pw-input"
              autocomplete="off"
            />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-bind-address-input">BindAddress</label>
            <input
              id="host-bind-address-input"
              v-model="hostForm.bindAddress"
              class="pw-input"
              autocomplete="off"
            />
          </div>
          <div class="input-group">
            <label class="input-label" for="host-proxy-jump-input">ProxyJump</label>
            <input
              id="host-proxy-jump-input"
              v-model="hostForm.proxyJump"
              class="pw-input"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" type="button" @click="closeHostDialog">Cancel</button>
          <button class="btn-ok" type="button" @click="submitHostDialog">
            <CheckCheck :size="14" :stroke-width="2.25" absolute-stroke-width aria-hidden="true" />
            {{ hostDialogMode === 'create' ? 'Create' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showDeleteDialog"
      class="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      @click.self="closeDeleteHostDialog"
      @keydown="handleDeleteDialogKeydown"
    >
      <div ref="deleteDialogRef" class="dialog confirm-dialog" tabindex="-1">
        <div class="dialog-header">
          <div class="dialog-title-row">
            <Trash2
              :size="16"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-title-icon danger-icon"
              aria-hidden="true"
            />
            <span id="delete-dialog-title" class="dialog-title">Delete SSH Host</span>
          </div>
          <button
            class="dialog-close-btn"
            type="button"
            aria-label="Close"
            @click="closeDeleteHostDialog"
          >
            <X :size="14" :stroke-width="2" absolute-stroke-width aria-hidden="true" />
          </button>
        </div>
        <div class="dialog-body">
          <div v-if="deleteDialogError" class="dialog-error" role="alert">
            <CircleAlert
              :size="13"
              :stroke-width="2"
              absolute-stroke-width
              class="dialog-error-icon"
              aria-hidden="true"
            />
            {{ deleteDialogError }}
          </div>
          <div class="delete-message">
            Host <span class="host-name-highlight">{{ deletingHostAlias }}</span> will be removed from
            <span class="host-name-highlight">~/.ssh/config</span>.
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" type="button" @click="closeDeleteHostDialog">Cancel</button>
          <button class="btn-danger" type="button" @click="confirmDeleteHost">
            <Trash2 :size="14" :stroke-width="2.25" absolute-stroke-width aria-hidden="true" />
            Delete
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
  padding: 0 44px 0 12px;
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

.add-host-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  touch-action: manipulation;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.22);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}
.add-host-btn:hover {
  background: var(--color-hover-strong);
  border-color: var(--color-accent);
  color: var(--color-accent-hover);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 6px rgba(0, 0, 0, 0.28);
}
.add-host-btn:active {
  background: var(--color-active);
  transform: scale(0.96);
}
.add-host-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .add-host-btn {
    transition: none;
  }
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

.host-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  min-width: 24px;
  min-height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
  transition:
    color var(--transition),
    border-color var(--transition),
    background var(--transition);
}
.host-action-btn:hover {
  color: var(--color-accent-hover);
  border-color: var(--color-border);
  background: var(--color-hover);
}
.host-action-btn.danger:hover {
  color: var(--color-error);
  border-color: var(--color-error-border);
  background: var(--color-error-subtle);
}
.host-action-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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

.active-count {
  font-size: 11px;
  color: var(--color-text-muted);
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

.host-form {
  max-height: min(68vh, 560px);
  overflow-y: auto;
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

.btn-danger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: var(--color-error);
  border: 1px solid transparent;
  color: #fff;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition);
}
.btn-danger:hover {
  background: #e64343;
}
.btn-danger:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.confirm-dialog {
  width: 420px;
}

.danger-icon {
  color: var(--color-error);
}

.delete-message {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.host-name-highlight {
  font-family: var(--font-mono);
  color: var(--color-text);
}
</style>
