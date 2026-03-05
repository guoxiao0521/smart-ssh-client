<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FileEntry, TreeNode } from '../types'
import TreeNodeItem from './TreeNodeItem.vue'

const props = defineProps<{
  connectionId: string
}>()

const emit = defineEmits<{
  fileSelect: [path: string]
}>()

const rootNodes = ref<TreeNode[]>([])
const rootLoading = ref(false)
const rootError = ref<string | null>(null)

watch(
  () => props.connectionId,
  (id) => { if (id) loadDir('/', null) },
  { immediate: true }
)

async function loadDir(path: string, parentNode: TreeNode | null): Promise<void> {
  if (parentNode) {
    parentNode.loading = true
    parentNode.error = undefined
  } else {
    rootLoading.value = true
    rootError.value = null
  }

  try {
    const entries: FileEntry[] = await window.ssh.listDir(props.connectionId, path)
    const sorted = entries.slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.filename.localeCompare(b.filename)
    })
    const nodes: TreeNode[] = sorted.map((e) => ({
      name: e.filename,
      path: path === '/' ? '/' + e.filename : path + '/' + e.filename,
      isDirectory: e.isDirectory,
      size: e.size,
      expanded: false,
      loading: false
    }))

    if (parentNode) {
      parentNode.children = nodes
    } else {
      rootNodes.value = nodes
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (parentNode) {
      parentNode.error = msg
    } else {
      rootError.value = msg
    }
  } finally {
    if (parentNode) {
      parentNode.loading = false
    } else {
      rootLoading.value = false
    }
  }
}

async function toggleNode(node: TreeNode): Promise<void> {
  if (!node.isDirectory) {
    emit('fileSelect', node.path)
    return
  }
  node.expanded = !node.expanded
  if (node.expanded && !node.children) {
    await loadDir(node.path, node)
  }
}
</script>

<template>
  <div class="file-tree">
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
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span class="section-title">Explorer</span>
      </div>
      <button class="icon-btn" title="Refresh" @click="loadDir('/', null)">
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

    <div v-if="rootLoading" class="loading-state">
      <svg
        width="14"
        height="14"
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
      <span>Loading...</span>
    </div>

    <div v-else-if="rootError" class="error-msg">
      <svg
        width="12"
        height="12"
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
      {{ rootError }}
    </div>

    <div v-else class="tree-content">
      <TreeNodeItem
        v-for="node in rootNodes"
        :key="node.path"
        :node="node"
        :depth="0"
        @toggle="toggleNode"
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
