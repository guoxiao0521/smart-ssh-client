<script setup lang="ts">
import type { TreeNode } from '../types'

const props = defineProps<{
  node: TreeNode
  selectedPath?: string
}>()

const emit = defineEmits<{
  dirNavigate: [node: TreeNode]
  fileSelect: [node: TreeNode]
  fileOpen: [node: TreeNode]
}>()

function handleClick(): void {
  if (props.node.isDirectory) {
    emit('dirNavigate', props.node)
  } else {
    emit('fileSelect', props.node)
  }
}

function handleDblClick(): void {
  if (!props.node.isDirectory) {
    emit('fileOpen', props.node)
  }
}
</script>

<template>
  <div
    class="tree-node"
    :class="{ selected: !props.node.isDirectory && props.selectedPath === props.node.path }"
    :title="props.node.path"
    @click="handleClick"
    @dblclick.stop="handleDblClick"
  >
    <span class="node-icon">
      <template v-if="props.node.isDirectory">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="icon-folder"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </template>
      <template v-else>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="icon-file"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </template>
    </span>

    <span class="node-name" :class="{ 'is-dir': props.node.isDirectory }">{{ props.node.name }}</span>

    <span v-if="props.node.isDirectory" class="node-chevron-right">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 13px;
  border-radius: 4px;
  margin: 1px 4px 1px 0;
  white-space: nowrap;
  overflow: hidden;
  transition: background var(--transition);
}
.tree-node:hover {
  background: var(--color-hover);
}
.tree-node.selected {
  background: var(--color-active);
}
.tree-node.selected .node-name {
  color: var(--color-accent-hover);
}
.tree-node.selected .icon-file {
  color: var(--color-accent-light);
}

.node-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-folder {
  color: #d29922;
}
.icon-file {
  color: var(--color-text-muted);
}

.node-name {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  font-size: 13px;
}
.node-name.is-dir {
  color: var(--color-text);
  font-weight: 500;
}

.node-chevron-right {
  flex-shrink: 0;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  opacity: 0.5;
}
.tree-node:hover .node-chevron-right {
  opacity: 1;
}
</style>
