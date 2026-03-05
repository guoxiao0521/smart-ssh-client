<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { TerminalDataPayload } from '../types'

const props = defineProps<{
  connectionId: string
}>()

const terminalEl = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let ptyId: string | null = null
let resizeObserver: ResizeObserver | null = null

const status = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle')
const errorMsg = ref('')

function onTerminalData(payload: TerminalDataPayload): void {
  if (payload.id === ptyId) {
    terminal?.write(payload.data)
  }
}

async function initTerminal(): Promise<void> {
  if (!terminalEl.value || !props.connectionId) return

  await cleanup()

  terminal = new Terminal({
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#79c0ff',
      cursorAccent: '#0d1117',
      selectionBackground: '#264f78',
      black: '#484f58',
      red: '#f85149',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#388bfd',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ff7b72',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    letterSpacing: 0,
    cursorBlink: true,
    allowTransparency: false,
    scrollback: 5000
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())
  terminal.open(terminalEl.value)

  status.value = 'connecting'
  try {
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions() ?? { cols: 80, rows: 24 }
    ptyId = await window.ssh.pty.create(props.connectionId, dims.cols, dims.rows)
    status.value = 'connected'

    window.ssh.pty.onData(onTerminalData)

    terminal.onData((data) => {
      if (ptyId) window.ssh.pty.input(ptyId, data)
    })

    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && terminal && ptyId) {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) window.ssh.pty.resize(ptyId, dims.cols, dims.rows)
      }
    })
    if (terminalEl.value) resizeObserver.observe(terminalEl.value)
  } catch (err: unknown) {
    status.value = 'error'
    errorMsg.value = err instanceof Error ? err.message : String(err)
    terminal.write('\r\n\x1b[31m[Error: ' + errorMsg.value + ']\x1b[0m\r\n')
  }
}

async function cleanup(): Promise<void> {
  window.ssh.pty.offData(onTerminalData)
  if (ptyId) {
    window.ssh.pty.close(ptyId)
    ptyId = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  terminal?.dispose()
  terminal = null
  fitAddon = null
}

onMounted(() => {
  if (props.connectionId) initTerminal()
})

watch(() => props.connectionId, (id) => {
  if (id) initTerminal()
  else cleanup()
})

onUnmounted(cleanup)
</script>

<template>
  <div class="terminal-panel">
    <div class="terminal-header">
      <div class="header-left">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="header-icon"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span class="section-title">Terminal</span>
      </div>
      <div class="header-right">
        <div v-if="status === 'connecting'" class="status-badge connecting">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="spin"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Connecting
        </div>
        <div v-else-if="status === 'connected'" class="status-badge connected">
          <span class="status-dot" />
          Connected
        </div>
        <div v-else-if="status === 'error'" class="status-badge error">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Error
        </div>
      </div>
    </div>

    <div v-if="!connectionId" class="empty-state">
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="empty-icon"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
      <span class="empty-title">No active connection</span>
      <span class="empty-subtitle">Select a host from the sidebar to start a terminal session</span>
    </div>

    <div v-else ref="terminalEl" class="terminal-container" />
  </div>
</template>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
  overflow: hidden;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  height: 34px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-panel-header);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon {
  color: var(--color-text-muted);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.header-right {
  display: flex;
  align-items: center;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 20px;
}

.status-badge.connecting {
  color: var(--color-warning);
  background: rgba(210, 153, 34, 0.1);
}
.status-badge.connected {
  color: var(--color-success);
  background: rgba(63, 185, 80, 0.1);
}
.status-badge.error {
  color: var(--color-error);
  background: var(--color-error-subtle);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 5px var(--color-success-glow);
}

.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
}

.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.3;
}

.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.empty-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 260px;
  line-height: 1.5;
}

.terminal-container {
  flex: 1;
  overflow: hidden;
  padding: 4px 2px;
}

:deep(.xterm) {
  height: 100%;
}
:deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
