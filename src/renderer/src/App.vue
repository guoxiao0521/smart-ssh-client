<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import ConnectionList from './components/ConnectionList.vue'
import FileTree from './components/FileTree.vue'
import FilePreview from './components/FilePreview.vue'
import TerminalPanel from './components/TerminalPanel.vue'
import { useSSH } from './composables/useSSH'

const { activeConnection, previewFile, setPreviewFile } = useSSH()

const sidebarCollapsed = ref(false)
const isPreviewDialogOpen = ref(false)

function handleFileOpen(path: string): void {
  if (activeConnection.value) {
    setPreviewFile(activeConnection.value.id, path)
    isPreviewDialogOpen.value = true
  }
}

function closePreviewDialog(): void {
  isPreviewDialogOpen.value = false
}

function onEscKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePreviewDialog()
}

watch(isPreviewDialogOpen, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onEscKey)
  } else {
    window.removeEventListener('keydown', onEscKey)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEscKey)
})
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
          <FileTree :connection-id="activeConnection.id" @file-open="handleFileOpen" />
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
      <TerminalPanel :connection-id="activeConnection?.id ?? ''" />
    </div>

    <Teleport to="body">
      <div
        v-if="isPreviewDialogOpen"
        class="preview-overlay"
        @click.self="closePreviewDialog"
      >
        <div class="preview-dialog">
          <div class="preview-dialog-header">
            <span class="preview-dialog-title">{{ previewFile?.path?.split('/').pop() ?? 'Preview' }}</span>
            <button class="preview-close-btn" title="Close" @click="closePreviewDialog">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="preview-dialog-body">
            <FilePreview
              :connection-id="previewFile?.connectionId ?? ''"
              :path="previewFile?.path ?? ''"
            />
          </div>
        </div>
      </div>
    </Teleport>
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

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.preview-dialog {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: min(860px, 90vw);
  height: min(620px, 85vh);
  display: flex;
  flex-direction: column;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.preview-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  height: 38px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-panel-header);
  gap: 8px;
}

.preview-dialog-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  flex: 1;
}

.preview-close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    background var(--transition),
    color var(--transition);
}
.preview-close-btn:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}

.preview-dialog-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
