<script setup lang="ts">
import { ChevronLeft, CircleAlert, Folder, LoaderCircle, RefreshCw } from 'lucide-vue-next'
import { ref, watch } from 'vue'
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

watch(
  () => props.connectionId,
  (id) => {
    if (id) {
      selectedPath.value = undefined
      navigateToDir('/')
    }
  },
  { immediate: true }
)

async function loadCurrentDir(): Promise<void> {
  isLoading.value = true
  loadError.value = null

  try {
    const entries: FileEntry[] = await window.ssh.listDir(props.connectionId, currentPath.value)
    const sorted = entries.slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.filename.localeCompare(b.filename)
    })
    currentNodes.value = sorted.map((e) => ({
      name: e.filename,
      path: currentPath.value === '/' ? '/' + e.filename : currentPath.value + '/' + e.filename,
      isDirectory: e.isDirectory,
      size: e.size,
      loading: false
    }))
  } catch (err: unknown) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
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
      <button class="icon-btn" title="Refresh" @click="loadCurrentDir">
        <RefreshCw :size="13" :stroke-width="2" aria-hidden="true" />
      </button>
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
        @dir-navigate="navigateToDir(($event as TreeNode).path)"
        @file-select="handleFileSelect"
        @file-open="handleFileOpen"
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
