<script setup lang="ts">
import { ChevronRight, File, Folder } from 'lucide-vue-next'
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
        <Folder
          :size="14"
          :stroke-width="1.8"
          class="icon-folder"
          aria-hidden="true"
        />
      </template>
      <template v-else>
        <File
          :size="13"
          :stroke-width="1.8"
          class="icon-file"
          aria-hidden="true"
        />
      </template>
    </span>

    <span class="node-name" :class="{ 'is-dir': props.node.isDirectory }">{{ props.node.name }}</span>

    <span v-if="props.node.isDirectory" class="node-chevron-right">
      <ChevronRight :size="11" :stroke-width="2.5" aria-hidden="true" />
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
