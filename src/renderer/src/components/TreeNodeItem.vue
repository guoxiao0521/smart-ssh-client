<script setup lang="ts">
import type { TreeNode } from '../types'

const props = defineProps<{
  node: TreeNode
  depth: number
  selectedPath?: string
}>()

const emit = defineEmits<{
  dirToggle: [node: TreeNode]
  fileSelect: [node: TreeNode]
  fileOpen: [node: TreeNode]
}>()

function handleClick(): void {
  if (props.node.isDirectory) {
    emit('dirToggle', props.node)
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
  <div class="tree-node-wrapper">
    <div
      class="tree-node"
      :class="{ selected: !props.node.isDirectory && props.selectedPath === props.node.path }"
      :style="{ paddingLeft: (props.depth * 14 + 8) + 'px' }"
      :title="props.node.path"
      @click="handleClick"
      @dblclick.stop="handleDblClick"
    >
      <span class="node-chevron">
        <template v-if="props.node.isDirectory">
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
            <path v-if="props.node.expanded" d="m6 9 6 6 6-6" />
            <path v-else d="m9 18 6-6-6-6" />
          </svg>
        </template>
        <template v-else>
          <span class="file-dot" />
        </template>
      </span>

      <span class="node-icon">
        <template v-if="props.node.isDirectory">
          <svg
            v-if="props.node.expanded"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="icon-folder-open"
          >
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
          </svg>
          <svg
            v-else
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

      <span v-if="props.node.loading" class="node-loading">
        <svg
          width="11"
          height="11"
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
      </span>
    </div>

    <div
      v-if="props.node.error"
      class="node-error"
      :style="{ paddingLeft: ((props.depth + 1) * 14 + 8) + 'px' }"
    >
      {{ props.node.error }}
    </div>

    <template v-if="props.node.expanded && props.node.children">
      <TreeNodeItem
        v-for="child in props.node.children"
        :key="child.path"
        :node="child"
        :depth="props.depth + 1"
        :selected-path="props.selectedPath"
        @dir-toggle="emit('dirToggle', $event)"
        @file-select="emit('fileSelect', $event)"
        @file-open="emit('fileOpen', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 3px;
  padding-bottom: 3px;
  padding-right: 8px;
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

.node-chevron {
  width: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.file-dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-text-muted);
  opacity: 0.5;
  margin: 0 auto;
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
.icon-folder-open {
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

.node-loading {
  flex-shrink: 0;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.node-error {
  font-size: 11px;
  color: var(--color-error);
  padding: 2px 8px 2px 0;
  opacity: 0.85;
}
</style>
