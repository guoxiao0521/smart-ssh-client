<script setup lang="ts">
import {
  ChevronLeft,
  CircleAlert,
  Download,
  Folder,
  LoaderCircle,
  RefreshCw,
  Upload
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DownloadFilesResult, FileEntry, TreeNode } from '../types'
import TreeNodeItem from './TreeNodeItem.vue'

const props = defineProps<{
  connectionId: string
  initialPath: string
}>()

const emit = defineEmits<{
  fileOpen: [path: string]
  pathChange: [connectionId: string, path: string]
}>()

const currentNodes = ref<TreeNode[]>([])
const currentPath = ref('/')
const pathInput = ref('/')
const isLoading = ref(false)
const isDownloading = ref(false)
const loadError = ref<string | null>(null)
const statusMessage = ref<string | null>(null)
const selectedPath = ref<string | undefined>(undefined)
const highlightedPath = ref<string | undefined>(undefined)
const checkedPaths = ref<Set<string>>(new Set())
const selectAllEl = ref<HTMLInputElement | null>(null)

const fileNodes = computed(() => currentNodes.value.filter((node) => !node.isDirectory))
const checkedCount = computed(() => checkedPaths.value.size)
const allFilesChecked = computed(
  () =>
    fileNodes.value.length > 0 && fileNodes.value.every((node) => checkedPaths.value.has(node.path))
)
const someFilesChecked = computed(() => checkedCount.value > 0 && !allFilesChecked.value)
const downloadLabel = computed(() =>
  checkedCount.value > 0
    ? `Download ${checkedCount.value} selected file${checkedCount.value === 1 ? '' : 's'}`
    : 'Download selected files'
)

type LoadDirResult = 'success' | 'failed' | 'stale'

let highlightTimer: ReturnType<typeof setTimeout> | undefined
let loadRequestSeq = 0

watch(
  () => props.connectionId,
  async (id) => {
    if (id) {
      loadRequestSeq++
      selectedPath.value = undefined
      highlightedPath.value = undefined
      clearChecked()
      statusMessage.value = null
      const targetPath = props.initialPath || '/'
      const restored = await navigateToDir(targetPath)
      if (restored === 'failed' && targetPath !== '/') {
        await navigateToDir('/')
      }
    }
  },
  { immediate: true }
)

watch([allFilesChecked, someFilesChecked, selectAllEl], async () => {
  await nextTick()
  if (selectAllEl.value) {
    selectAllEl.value.indeterminate = someFilesChecked.value
  }
})

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})

async function loadCurrentDir(): Promise<LoadDirResult> {
  const requestId = ++loadRequestSeq
  const directoryPath = currentPath.value
  isLoading.value = true
  loadError.value = null

  try {
    const entries: FileEntry[] = await window.ssh.listDir(props.connectionId, directoryPath)
    if (requestId !== loadRequestSeq) return 'stale'
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
    pruneChecked()
    return 'success'
  } catch (err: unknown) {
    if (requestId !== loadRequestSeq) return 'stale'
    loadError.value = err instanceof Error ? err.message : String(err)
    return 'failed'
  } finally {
    if (requestId === loadRequestSeq) {
      isLoading.value = false
    }
  }
}

function clearChecked(): void {
  checkedPaths.value = new Set()
}

function pruneChecked(): void {
  const valid = new Set(fileNodes.value.map((node) => node.path))
  checkedPaths.value = new Set([...checkedPaths.value].filter((path) => valid.has(path)))
}

function handleFileCheckToggle(node: TreeNode, checked: boolean): void {
  const next = new Set(checkedPaths.value)
  if (checked) {
    next.add(node.path)
  } else {
    next.delete(node.path)
  }
  checkedPaths.value = next
}

function toggleSelectAll(): void {
  if (allFilesChecked.value) {
    clearChecked()
    return
  }
  checkedPaths.value = new Set(fileNodes.value.map((node) => node.path))
}

async function navigateToDir(path: string): Promise<LoadDirResult> {
  const previousPath = currentPath.value
  const connectionId = props.connectionId
  currentPath.value = path
  pathInput.value = path
  clearChecked()
  statusMessage.value = null
  const result = await loadCurrentDir()

  if (result === 'stale') {
    return 'stale'
  }

  if (result === 'failed') {
    currentPath.value = previousPath
    pathInput.value = previousPath
    return 'failed'
  }

  emit('pathChange', connectionId, path)
  return 'success'
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
    if (checkedPaths.value.has(node.path)) {
      const next = new Set(checkedPaths.value)
      next.delete(node.path)
      checkedPaths.value = next
    }
    await loadCurrentDir()
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

async function handleFileDownload(node: TreeNode): Promise<void> {
  statusMessage.value = null
  loadError.value = null
  try {
    const result = await window.ssh.downloadFile(props.connectionId, node.path)
    if (result.canceled) return
    statusMessage.value = `Downloaded ${node.name}`
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

function formatDownloadFilesResult(result: DownloadFilesResult): {
  error: string | null
  info: string | null
} {
  const parts: string[] = []
  if (result.downloaded > 0) {
    parts.push(`Downloaded ${result.downloaded} file${result.downloaded === 1 ? '' : 's'}`)
  }
  if (result.skipped.length > 0) {
    parts.push(
      `Skipped ${result.skipped.length} existing file${result.skipped.length === 1 ? '' : 's'}`
    )
  }
  if (result.failures.length > 0) {
    const [firstFailure, ...restFailures] = result.failures
    const extra = restFailures.length > 0 ? ` (+${restFailures.length} more)` : ''
    const failureText = firstFailure
      ? `${result.failures.length} failed: ${firstFailure.message}${extra}`
      : `${result.failures.length} failed`
    parts.push(failureText)
    return { error: parts.join('. '), info: null }
  }
  if (parts.length === 0) {
    return { error: null, info: 'No files were downloaded' }
  }
  return { error: null, info: parts.join('. ') }
}

async function handleBulkDownload(): Promise<void> {
  const remotePaths = [...checkedPaths.value]
  if (remotePaths.length === 0 || isDownloading.value) return

  statusMessage.value = null
  loadError.value = null
  isDownloading.value = true
  try {
    const result = await window.ssh.downloadFiles(props.connectionId, remotePaths)
    if (result.canceled) return
    const message = formatDownloadFilesResult(result)
    loadError.value = message.error
    statusMessage.value = message.info
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isDownloading.value = false
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
        <button v-if="currentPath !== '/'" class="icon-btn" title="Go up" @click="navigateUp">
          <ChevronLeft :size="13" :stroke-width="2.5" aria-hidden="true" />
        </button>
        <Folder v-else :size="12" :stroke-width="2" class="header-icon" aria-hidden="true" />
        <span class="section-title">Explorer</span>
      </div>
      <div class="header-actions">
        <button
          class="icon-btn"
          :title="downloadLabel"
          :aria-label="downloadLabel"
          :disabled="isLoading || checkedCount === 0"
          :aria-busy="isDownloading"
          @click="handleBulkDownload"
        >
          <LoaderCircle
            v-if="isDownloading"
            :size="13"
            :stroke-width="2"
            class="spin"
            aria-hidden="true"
          />
          <Download v-else :size="13" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          class="icon-btn"
          title="Upload files"
          :disabled="isLoading || isDownloading"
          @click="handleUpload"
        >
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

    <div v-if="!isLoading && fileNodes.length > 0" class="selection-bar">
      <label class="select-all">
        <input
          ref="selectAllEl"
          type="checkbox"
          class="select-all-checkbox"
          :checked="allFilesChecked"
          :disabled="isDownloading"
          :aria-label="allFilesChecked ? 'Deselect all files' : 'Select all files'"
          @change="toggleSelectAll"
        />
        <span>Select all</span>
      </label>
      <span v-if="checkedCount > 0" class="selection-count">{{ checkedCount }} selected</span>
    </div>

    <div v-if="loadError" class="error-msg" role="alert">
      <CircleAlert :size="12" :stroke-width="2" aria-hidden="true" />
      {{ loadError }}
    </div>

    <div v-else-if="statusMessage" class="status-msg" role="status">
      {{ statusMessage }}
    </div>

    <div v-if="isLoading" class="loading-state">
      <LoaderCircle :size="14" :stroke-width="2" class="spin" aria-hidden="true" />
      <span>Loading...</span>
    </div>

    <div v-else class="tree-content">
      <TreeNodeItem
        v-for="node in currentNodes"
        :key="node.path"
        :node="node"
        :selected-path="selectedPath"
        :highlighted-path="highlightedPath"
        :checked="checkedPaths.has(node.path)"
        :check-disabled="isDownloading"
        @dir-navigate="navigateToDir(($event as TreeNode).path)"
        @file-select="handleFileSelect"
        @file-open="handleFileOpen"
        @file-download="handleFileDownload"
        @file-delete="handleFileDelete"
        @file-check-toggle="handleFileCheckToggle"
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
.icon-btn:hover:not(:disabled) {
  background: var(--color-hover-strong);
  color: var(--color-text);
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 4px 8px;
  min-height: 28px;
  border-bottom: 1px solid var(--color-border);
}

.select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  user-select: none;
}

.select-all-checkbox {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}
.select-all-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.select-all-checkbox:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

.selection-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-secondary);
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
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
  flex-shrink: 0;
}

.status-msg {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-success);
  line-height: 1.4;
  flex-shrink: 0;
}

.tree-content {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
}
</style>
