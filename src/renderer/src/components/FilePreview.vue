<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import hljs from 'highlight.js'
import type { FileContent } from '../types'

const props = defineProps<{
  connectionId: string
  path: string
}>()

const content = ref<FileContent | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const highlightedHtml = ref('')

const fileExtension = computed(() => props.path.split('.').pop()?.toLowerCase() ?? '')

const fileName = computed(() => props.path.split('/').pop() ?? props.path)

const extColorMap: Record<string, string> = {
  js: '#f7df1e', ts: '#3178c6', vue: '#42b883', py: '#3572a5',
  rb: '#cc342d', go: '#00add8', rs: '#dea584', sh: '#4eaa25',
  json: '#f7df1e', yaml: '#cb171e', yml: '#cb171e', md: '#083fa1',
  css: '#563d7c', html: '#e34c26', xml: '#e34c26', sql: '#e38c00',
  txt: '#8b949e', log: '#8b949e', conf: '#8b949e', env: '#8b949e',
}

const extBadgeColor = computed(() => extColorMap[fileExtension.value] ?? '#58a6ff')

watch(
  () => [props.connectionId, props.path] as [string, string],
  async ([connId, filePath]) => {
    if (!connId || !filePath) return
    loading.value = true
    error.value = null
    content.value = null
    highlightedHtml.value = ''
    try {
      const result = await window.ssh.readFile(connId, filePath)
      content.value = result
      if (result.text !== undefined) {
        const ext = filePath.split('.').pop() ?? ''
        try {
          const highlighted = hljs.highlight(result.text, { language: ext, ignoreIllegals: true })
          highlightedHtml.value = highlighted.value
        } catch {
          highlightedHtml.value = escapeHtml(result.text)
        }
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="file-preview">
    <div class="preview-header">
      <div class="header-left">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="header-icon"
          :style="{ color: path ? extBadgeColor : 'var(--color-text-muted)' }"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span class="file-name">{{ path ? fileName : 'No file selected' }}</span>
        <span v-if="path && fileExtension" class="ext-badge" :style="{ color: extBadgeColor, borderColor: extBadgeColor + '40', background: extBadgeColor + '14' }">
          .{{ fileExtension }}
        </span>
      </div>
      <span v-if="content && content.size != null" class="file-size">{{ formatSize(content.size) }}</span>
    </div>

    <div v-if="!path" class="empty-state">
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="empty-icon"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <span class="empty-title">No file selected</span>
      <span class="empty-subtitle">Click a file in the explorer to preview its contents</span>
    </div>

    <div v-else-if="loading" class="loading-state">
      <svg
        width="16"
        height="16"
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
      <span>Loading file...</span>
    </div>

    <div v-else-if="error" class="error-msg">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="error-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {{ error }}
    </div>

    <div v-else-if="content?.error" class="error-msg">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="error-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {{ content.error }}
    </div>

    <div v-else-if="content?.text !== undefined" class="code-container">
      <pre class="code-pre"><code v-html="highlightedHtml || escapeHtml(content.text ?? '')" /></pre>
    </div>

    <div v-else-if="content?.base64" class="image-container">
      <img :src="`data:${content.mimeType};base64,${content.base64}`" class="preview-image" alt="File preview" />
    </div>

    <div v-else class="binary-info">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="binary-icon"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span class="binary-label">Binary file</span>
      <div class="meta-table">
        <div class="meta-row">
          <span class="meta-key">Type</span>
          <span class="meta-val">{{ content?.mimeType ?? '—' }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">Size</span>
          <span class="meta-val">{{ content ? formatSize(content.size) : '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 34px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-panel-header);
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.header-icon {
  flex-shrink: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
}

.ext-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.03em;
  font-family: var(--font-mono);
}

.file-size {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
}
.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.25;
}
.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.empty-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 280px;
  line-height: 1.5;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px;
  padding: 10px 12px;
  background: var(--color-error-subtle);
  border: 1px solid var(--color-error-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-error);
  line-height: 1.5;
}
.error-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.code-container {
  flex: 1;
  overflow: auto;
}

.code-pre {
  margin: 0;
  padding: 16px 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre;
  min-height: 100%;
  tab-size: 2;
}

.image-container {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px;
}
.preview-image {
  max-width: 100%;
  object-fit: contain;
  border-radius: 4px;
}

.binary-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
}
.binary-icon {
  color: var(--color-text-muted);
  opacity: 0.3;
}
.binary-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.meta-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 10px 16px;
  min-width: 200px;
}
.meta-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
}
.meta-key {
  color: var(--color-text-muted);
  width: 40px;
  flex-shrink: 0;
}
.meta-val {
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
