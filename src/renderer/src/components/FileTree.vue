<script setup lang="ts">
import { ChevronLeft, CircleAlert, Folder, LoaderCircle, RefreshCw, Upload } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import type { FileEntry, TreeNode } from '../types'
import TreeNodeItem from './TreeNodeItem.vue'

const props = defineProps<{
  connectionId: string
}>()

const emit = defineEmits<{
  fileOpen: [path: string]
}>()

const currentNodes = ref<TreeNode[]>([])
const currentPath = ref('/')
const pathInput = ref('/')
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const selectedPath = ref<string | undefined>(undefined)
const highlightedPath = ref<string | undefined>(undefined)

let highlightTimer: ReturnType<typeof setTimeout> | undefined
let loadRequestSeq = 0

watch(
  () => props.connectionId,
  (id) => {
    if (id) {
      selectedPath.value = undefined
      highlightedPath.value = undefined
      navigateToDir('/')
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})

async function loadCurrentDir(): Promise<void> {
  const requestId = ++loadRequestSeq
  const directoryPath = currentPath.value
  isLoading.value = true
  loadError.value = null

  try {
    const entries: FileEntry[] = await window.ssh.listDir(props.connectionId, directoryPath)
    if (requestId !== loadRequestSeq) return
    const sorted = entries.slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.filename.localeCompare(b.filename)
    })
    currentNodes.value = sorted.map((e) => ({
      name: e.filename,
      path: directoryPath === '/' ? '/' + e.filename : directoryPath + '/' + e.filename,
      isDirectory: e.isDirectory,
      size: e.size,
      loading: false
    }))
  } catch (err: unknown) {
    if (requestId !== loadRequestSeq) return
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (requestId === loadRequestSeq) {
      isLoading.value = false
    }
  }
}

async function navigateToDir(path: string): Promise<boolean> {
  const previousPath = currentPath.value
  currentPath.value = path
  pathInput.value = path
  await loadCurrentDir()

  if (loadError.value) {
    currentPath.value = previousPath
    pathInput.value = previousPath
    return false
  }
  return true
}

function navigateUp(): void {
  if (currentPath.value === '/') return
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  navigateToDir(segments.length === 0 ? '/' : '/' + segments.join('/'))
}

async function handlePathSubmit(): Promise<void> {
  const trimmed = pathInput.value.trim()
  if (!trimmed || trimmed === currentPath.value) {
    pathInput.value = currentPath.value
    return
  }
  await navigateToDir(trimmed)
}

function handlePathBlur(): void {
  pathInput.value = currentPath.value
}

function handleFileSelect(node: TreeNode): void {
  selectedPath.value = node.path
}

function handleFileOpen(node: TreeNode): void {
  selectedPath.value = node.path
  emit('fileOpen', node.path)
}

async function handleFileDelete(node: TreeNode): Promise<void> {
  if (!window.confirm(`Delete "${node.name}"?\n\nThis action cannot be undone.`)) return
  try {
    await window.ssh.deleteFile(props.connectionId, node.path)
    if (selectedPath.value === node.path) selectedPath.value = undefined
    await loadCurrentDir()
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

async function handleFileDownload(node: TreeNode): Promise<void> {
  try {
    const result = await window.ssh.downloadFile(props.connectionId, node.path)
    if (result.canceled) return
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

async function handleUpload(): Promise<void> {
  try {
    const result = await window.ssh.uploadFile(props.connectionId, currentPath.value)
    if (result.uploadedPaths.length === 0) return
    const latestUploadedPath = result.uploadedPaths[result.uploadedPaths.length - 1]
    selectedPath.value = undefined
    highlightedPath.value = undefined
    await loadCurrentDir()
    selectedPath.value = latestUploadedPath
    highlightedPath.value = latestUploadedPath
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlightedPath.value = undefined
    }, 1600)
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="file-tree">
    <div class="section-header">
      <div class="header-left">
        <button
          v-if="currentPath !== '/'"
          class="icon-btn"
          title="Go up"
          @click="navigateUp"
        >
          <ChevronLeft :size="13" :stroke-width="2.5" aria-hidden="true" />
        </button>
        <Folder
          v-else
          :size="12"
          :stroke-width="2"
          class="header-icon"
          aria-hidden="true"
        />
        <span class="section-title">Explorer</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="Upload files" :disabled="isLoading" @click="handleUpload">
          <Upload :size="13" :stroke-width="2" aria-hidden="true" />
        </button>
        <button class="icon-btn" title="Refresh" @click="loadCurrentDir">
          <RefreshCw :size="13" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="path-bar">
      <input
        v-model="pathInput"
        class="path-input"
        spellcheck="false"
        @keydown.enter="handlePathSubmit"
        @blur="handlePathBlur"
      />
    </div>

    <div v-if="isLoading" class="loading-state">
      <LoaderCircle
        :size="14"
        :stroke-width="2"
        class="spin"
        aria-hidden="true"
      />
      <span>Loading...</span>
    </div>

    <div v-else-if="loadError" class="error-msg">
      <CircleAlert :size="12" :stroke-width="2" aria-hidden="true" />
      {{ loadError }}
    </div>

    <div v-else class="tree-content">
      <TreeNodeItem
        v-for="node in currentNodes"
        :key="node.path"
        :node="node"
        :selected-path="selectedPath"
        :highlighted-path="highlightedPath"
        @dir-navigate="navigateToDir(($event as TreeNode).path)"
        @file-select="handleFileSelect"
        @file-open="handleFileOpen"
        @file-download="handleFileDownload"
        @file-delete="handleFileDelete"
      />
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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

.path-bar {
  flex-shrink: 0;
  padding: 5px 8px;
  border-bottom: 1px solid var(--color-border);
}

.path-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--color-input-bg, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  padding: 3px 7px;
  outline: none;
  transition: border-color var(--transition);
}
.path-input:focus {
  border-color: var(--color-accent, #4a9eff);
  color: var(--color-text);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.spin {
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
}

.tree-content {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
}
</style>
