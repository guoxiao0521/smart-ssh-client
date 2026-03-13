<script setup lang="ts">
import { ChevronRight, File, Folder, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'
import type { TreeNode } from '../types'

const props = defineProps<{
  node: TreeNode
  selectedPath?: string
  highlightedPath?: string
}>()

const emit = defineEmits<{
  dirNavigate: [node: TreeNode]
  fileSelect: [node: TreeNode]
  fileOpen: [node: TreeNode]
  fileDelete: [node: TreeNode]
}>()

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

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

function handleContextMenu(e: MouseEvent): void {
  if (props.node.isDirectory) return
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true
  window.addEventListener('click', closeMenu, { once: true })
  window.addEventListener('keydown', handleEscape, { once: true })
}

function closeMenu(): void {
  menuVisible.value = false
  window.removeEventListener('keydown', handleEscape)
}

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu()
}

function handleDelete(): void {
  closeMenu()
  emit('fileDelete', props.node)
}
</script>

<template>
  <div
    class="tree-node"
    :class="{
      selected: !props.node.isDirectory && props.selectedPath === props.node.path,
      uploaded: !props.node.isDirectory && props.highlightedPath === props.node.path
    }"
    :title="props.node.path"
    @click="handleClick"
    @dblclick.stop="handleDblClick"
    @contextmenu.prevent="handleContextMenu"
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

  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="context-menu"
      :style="{ left: menuX + 'px', top: menuY + 'px' }"
    >
      <button class="context-menu-item danger" @click.stop="handleDelete">
        <Trash2 :size="13" :stroke-width="2" aria-hidden="true" />
        <span>Delete</span>
      </button>
    </div>
  </Teleport>
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
.tree-node.uploaded {
  animation: uploaded-flash 1.6s ease-out;
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

@keyframes uploaded-flash {
  0% {
    background: color-mix(in srgb, var(--color-accent, #4a9eff) 28%, transparent);
  }
  100% {
    background: transparent;
  }
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--color-panel, #1e2228);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  min-width: 120px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: none;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: background var(--transition), color var(--transition);
}
.context-menu-item:hover {
  background: var(--color-hover-strong);
  color: var(--color-text);
}
.context-menu-item.danger {
  color: var(--color-error, #f85149);
}
.context-menu-item.danger:hover {
  background: color-mix(in srgb, var(--color-error, #f85149) 15%, transparent);
  color: var(--color-error, #f85149);
}
</style>
