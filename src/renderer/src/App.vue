<script setup lang="ts">
import { ref } from 'vue'
import ConnectionList from './components/ConnectionList.vue'
import FileTree from './components/FileTree.vue'
import FilePreview from './components/FilePreview.vue'
import TerminalPanel from './components/TerminalPanel.vue'
import { useSSH } from './composables/useSSH'

const { activeConnection, previewFile, setPreviewFile } = useSSH()

const sidebarCollapsed = ref(false)

const splitPercent = ref(50)
let isDragging = false

function onSplitMouseDown(e: MouseEvent): void {
  isDragging = true
  e.preventDefault()

  const rightPanel = (e.target as HTMLElement).closest('.right-panel') as HTMLElement
  if (!rightPanel) return

  const startY = e.clientY
  const startPercent = splitPercent.value
  const totalHeight = rightPanel.clientHeight

  function onMove(me: MouseEvent): void {
    if (!isDragging) return
    const delta = me.clientY - startY
    const deltaPercent = (delta / totalHeight) * 100
    splitPercent.value = Math.min(80, Math.max(20, startPercent + deltaPercent))
  }

  function onUp(): void {
    isDragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function handleFileSelect(path: string): void {
  if (activeConnection.value) {
    setPreviewFile(activeConnection.value.id, path)
  }
}
</script>

<template>
  <div class="app-layout">
    <div class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <button
        class="collapse-btn"
        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
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
          <path v-if="sidebarCollapsed" d="m9 18 6-6-6-6" />
          <path v-else d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <template v-if="!sidebarCollapsed">
        <div class="sidebar-section connection-section">
          <ConnectionList />
        </div>
        <div class="sidebar-divider" />
        <div class="sidebar-section file-tree-section" v-if="activeConnection">
          <FileTree :connection-id="activeConnection.id" @file-select="handleFileSelect" />
        </div>
        <div v-else class="sidebar-section empty-section">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="empty-icon"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span class="empty-hint">Connect to browse files</span>
        </div>
      </template>
    </div>

    <div class="right-panel">
      <div class="panel-pane" :style="{ height: splitPercent + '%' }">
        <FilePreview
          :connection-id="previewFile?.connectionId ?? ''"
          :path="previewFile?.path ?? ''"
        />
      </div>

      <div class="resize-handle" @mousedown="onSplitMouseDown">
        <div class="resize-handle-dots" />
      </div>

      <div class="panel-pane" :style="{ height: (100 - splitPercent) + '%' }">
        <TerminalPanel :connection-id="activeConnection?.id ?? ''" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 252px;
  min-width: 252px;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  position: relative;
  transition:
    width var(--transition-normal),
    min-width var(--transition-normal);
  overflow: hidden;
}
.sidebar.collapsed {
  width: 32px;
  min-width: 32px;
}

.collapse-btn {
  position: absolute;
  right: 6px;
  top: 8px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition),
    color var(--transition);
}
.collapse-btn:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.connection-section {
  flex-shrink: 0;
  max-height: 260px;
}

.file-tree-section {
  flex: 1;
  overflow: hidden;
}

.sidebar-divider {
  height: 1px;
  background: var(--color-border);
  flex-shrink: 0;
}

.empty-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
}
.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}
.empty-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  line-height: 1.5;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  background: var(--color-bg);
}

.panel-pane {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.resize-handle {
  height: 5px;
  background: var(--color-border);
  cursor: ns-resize;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
}
.resize-handle:hover,
.resize-handle:active {
  background: var(--color-accent);
}
.resize-handle-dots {
  width: 24px;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  pointer-events: none;
}
.resize-handle:hover .resize-handle-dots,
.resize-handle:active .resize-handle-dots {
  background: rgba(255, 255, 255, 0.4);
}
</style>
