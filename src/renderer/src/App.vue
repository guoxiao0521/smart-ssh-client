<script setup lang="ts">
import { ChevronLeft, ChevronRight, FolderOpen, Server, X } from 'lucide-vue-next'
import { ref, watch, onUnmounted } from 'vue'
import ConnectionList from './components/ConnectionList.vue'
import FileTree from './components/FileTree.vue'
import FilePreview from './components/FilePreview.vue'
import TerminalPanel from './components/TerminalPanel.vue'
import { useSSH } from './composables/useSSH'
import type { PreviewFile } from './types'

const {
  sessions,
  activeSession,
  activateSession,
  disconnectHost
} = useSSH()

const sidebarCollapsed = ref(false)
const isPreviewDialogOpen = ref(false)
const previewDialogFile = ref<PreviewFile | null>(null)

function handleFileOpen(path: string): void {
  if (activeSession.value) {
    previewDialogFile.value = { connectionId: activeSession.value.id, path }
    isPreviewDialogOpen.value = true
  }
}

function closePreviewDialog(): void {
  isPreviewDialogOpen.value = false
  previewDialogFile.value = null
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
        type="button"
        :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <ChevronRight v-if="sidebarCollapsed" :size="14" :stroke-width="2" aria-hidden="true" />
        <ChevronLeft v-else :size="14" :stroke-width="2" aria-hidden="true" />
      </button>

      <template v-if="!sidebarCollapsed">
        <div class="sidebar-section connection-section">
          <ConnectionList />
        </div>
        <div class="sidebar-divider" />
        <div class="sidebar-section file-tree-section" v-if="activeSession">
          <FileTree :connection-id="activeSession.id" @file-open="handleFileOpen" />
        </div>
        <div v-else class="sidebar-section empty-section">
          <FolderOpen
            :size="20"
            :stroke-width="1.5"
            class="empty-icon"
            aria-hidden="true"
          />
          <span class="empty-hint">Connect to browse files</span>
        </div>
      </template>
    </div>

    <div class="right-panel">
      <div v-if="sessions.length > 0" class="session-tabs" role="tablist" aria-label="Connection sessions">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-tab"
          :class="{ active: activeSession?.id === session.id }"
          role="tab"
          tabindex="0"
          :aria-selected="activeSession?.id === session.id"
          @click="activateSession(session.id)"
          @keydown.enter="activateSession(session.id)"
          @keydown.space.prevent="activateSession(session.id)"
        >
          <Server :size="12" :stroke-width="2" aria-hidden="true" />
          <span class="session-tab-label">{{ session.alias }}</span>
          <button
            type="button"
            class="session-tab-close"
            aria-label="Close session"
            @click.stop="disconnectHost(session.id)"
          >
            <X :size="12" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>
      <TerminalPanel
        v-for="session in sessions"
        :key="session.id"
        v-show="activeSession?.id === session.id"
        :connection-id="session.id"
      />
      <div v-if="sessions.length === 0" class="terminal-empty-state">
        <Server :size="24" :stroke-width="1.5" class="empty-icon" aria-hidden="true" />
        <span class="empty-hint">Connect to a host to open a terminal</span>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isPreviewDialogOpen"
        class="preview-overlay"
        @click.self="closePreviewDialog"
      >
        <div class="preview-dialog">
          <div class="preview-dialog-header">
            <span class="preview-dialog-title">
              {{ previewDialogFile?.path?.split('/').pop() ?? 'Preview' }}
            </span>
            <button class="preview-close-btn" title="Close" @click="closePreviewDialog">
              <X :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <div class="preview-dialog-body">
            <FilePreview
              :connection-id="previewDialogFile?.connectionId ?? ''"
              :path="previewDialogFile?.path ?? ''"
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
  top: 4px;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  touch-action: manipulation;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 1px 2px rgba(0, 0, 0, 0.22);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}
.collapse-btn:hover {
  background: var(--color-hover-strong);
  border-color: var(--color-accent);
  color: var(--color-accent-hover);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 6px rgba(0, 0, 0, 0.28);
}
.collapse-btn:active {
  background: var(--color-active);
  transform: scale(0.96);
}
.collapse-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .collapse-btn {
    transition: none;
  }
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

.session-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel-header);
  overflow-x: auto;
}

.session-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.session-tab:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.session-tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.session-tab.active {
  background: var(--color-active);
  border-color: var(--color-accent);
  color: var(--color-accent-hover);
}

.session-tab-label {
  font-size: 12px;
  line-height: 1.5;
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-tab-close {
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--color-text-muted);
  transition:
    background var(--transition),
    color var(--transition);
}

.session-tab-close:hover {
  background: var(--color-error-subtle);
  color: var(--color-error);
}

.terminal-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
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
