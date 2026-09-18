<script setup lang="ts">
import { Check, CircleAlert, Copy, File, FileText, LoaderCircle, Minimize2 } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import hljs from 'highlight.js'
import type { FileContent } from '../types'

type CopyKind = 'plain' | 'compact'
type CopyStatus = 'idle' | 'success' | 'error'

const props = defineProps<{
  connectionId: string
  path: string
}>()

const content = ref<FileContent | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const highlightedHtml = ref('')
const copyStatus = ref<Record<CopyKind, CopyStatus>>({
  plain: 'idle',
  compact: 'idle'
})

let requestSeq = 0
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const canCopyText = computed(
  () => content.value?.text !== undefined && !content.value.error && !loading.value && !error.value
)

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
    const seq = ++requestSeq
    loading.value = true
    error.value = null
    content.value = null
    highlightedHtml.value = ''
    resetCopyStatus()
    try {
      const result = await window.ssh.readFile(connId, filePath)
      if (seq !== requestSeq) return
      content.value = result
      if (result.text !== undefined) {
        const ext = filePath.split('.').pop() ?? ''
        try {
          const highlighted = hljs.highlight(result.text, { language: ext, ignoreIllegals: true })
          if (seq !== requestSeq) return
          highlightedHtml.value = highlighted.value
        } catch {
          if (seq !== requestSeq) return
          highlightedHtml.value = escapeHtml(result.text)
        }
      }
    } catch (err: unknown) {
      if (seq !== requestSeq) return
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      if (seq === requestSeq) loading.value = false
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

function compactJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim()
  }
  if (Array.isArray(value)) {
    return value.map(compactJsonValue)
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      result[key] = compactJsonValue(nested)
    }
    return result
  }
  return value
}

function compressText(text: string): string {
  const trimmed = text.trim()
  try {
    return JSON.stringify(compactJsonValue(JSON.parse(trimmed)))
  } catch {
    // Not valid JSON; fall through to whitespace collapse.
  }

  return trimmed
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join(' ')
}

function resetCopyStatus(): void {
  copyStatus.value = { plain: 'idle', compact: 'idle' }
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = null
  }
}

function showCopyFeedback(kind: CopyKind, status: CopyStatus): void {
  copyStatus.value = { plain: 'idle', compact: 'idle', [kind]: status }
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => {
    copyStatus.value[kind] = 'idle'
    copyFeedbackTimer = null
  }, 1600)
}

function copyButtonTitle(kind: CopyKind): string {
  const status = copyStatus.value[kind]
  if (status === 'success') return 'Copied'
  if (status === 'error') return 'Copy failed'
  return kind === 'compact' ? 'Copy compacted' : 'Copy'
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('Copy failed')
}

async function copyText(kind: CopyKind): Promise<void> {
  const text = content.value?.text
  if (text === undefined) return
  try {
    await writeClipboard(kind === 'compact' ? compressText(text) : text)
    showCopyFeedback(kind, 'success')
  } catch {
    showCopyFeedback(kind, 'error')
  }
}

onUnmounted(() => {
  resetCopyStatus()
})
</script>

<template>
  <div class="file-preview">
    <div class="preview-header">
      <div class="header-left">
        <File
          :size="13"
          :stroke-width="1.8"
          class="header-icon"
          :style="{ color: path ? extBadgeColor : 'var(--color-text-muted)' }"
          aria-hidden="true"
        />
        <span class="file-name">{{ path ? fileName : 'No file selected' }}</span>
        <span v-if="path && fileExtension" class="ext-badge" :style="{ color: extBadgeColor, borderColor: extBadgeColor + '40', background: extBadgeColor + '14' }">
          .{{ fileExtension }}
        </span>
      </div>
      <div class="header-right">
        <span v-if="content && content.size != null" class="file-size">{{
          formatSize(content.size)
        }}</span>
        <div v-if="canCopyText" class="copy-actions">
          <button
            class="copy-btn"
            type="button"
            :class="{
              success: copyStatus.plain === 'success',
              error: copyStatus.plain === 'error'
            }"
            :title="copyButtonTitle('plain')"
            :aria-label="copyButtonTitle('plain')"
            @click="copyText('plain')"
          >
            <Check
              v-if="copyStatus.plain === 'success'"
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <CircleAlert
              v-else-if="copyStatus.plain === 'error'"
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <Copy v-else :size="12" :stroke-width="2" aria-hidden="true" />
            <span>Copy</span>
          </button>
          <button
            class="copy-btn"
            type="button"
            :class="{
              success: copyStatus.compact === 'success',
              error: copyStatus.compact === 'error'
            }"
            :title="copyButtonTitle('compact')"
            :aria-label="copyButtonTitle('compact')"
            @click="copyText('compact')"
          >
            <Check
              v-if="copyStatus.compact === 'success'"
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <CircleAlert
              v-else-if="copyStatus.compact === 'error'"
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <Minimize2 v-else :size="12" :stroke-width="2" aria-hidden="true" />
            <span>Compact</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="!path" class="empty-state">
      <FileText
        :size="36"
        :stroke-width="1.2"
        class="empty-icon"
        aria-hidden="true"
      />
      <span class="empty-title">No file selected</span>
      <span class="empty-subtitle">Click a file in the explorer to preview its contents</span>
    </div>

    <div v-else-if="loading" class="loading-state">
      <LoaderCircle
        :size="16"
        :stroke-width="2"
        class="spin"
        aria-hidden="true"
      />
      <span>Loading file...</span>
    </div>

    <div v-else-if="error" class="error-msg">
      <CircleAlert
        :size="13"
        :stroke-width="2"
        class="error-icon"
        aria-hidden="true"
      />
      {{ error }}
    </div>

    <div v-else-if="content?.error" class="error-msg">
      <CircleAlert
        :size="13"
        :stroke-width="2"
        class="error-icon"
        aria-hidden="true"
      />
      {{ content.error }}
    </div>

    <div v-else-if="content?.text !== undefined" class="code-container">
      <pre class="code-pre"><code v-html="highlightedHtml || escapeHtml(content.text ?? '')" /></pre>
    </div>

    <div v-else-if="content?.base64" class="image-container">
      <img :src="`data:${content.mimeType};base64,${content.base64}`" class="preview-image" alt="File preview" />
    </div>

    <div v-else class="binary-info">
      <File
        :size="28"
        :stroke-width="1.5"
        class="binary-icon"
        aria-hidden="true"
      />
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

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.file-size {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.copy-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.copy-btn {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 2px 7px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition);
}

.copy-btn:hover:not(:disabled) {
  background: var(--color-hover-strong);
  color: var(--color-text);
  border-color: var(--color-text-muted);
}

.copy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.copy-btn:focus-visible {
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

.copy-btn.success {
  color: var(--color-success);
  border-color: var(--color-success);
}

.copy-btn.error {
  color: var(--color-error);
  border-color: var(--color-error);
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
