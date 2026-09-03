<template>
  <div class="panel progress-panel" v-if="isCopying || copyProgress">
    <div class="panel-header">
      <h2>{{ operationLabel }}进度</h2>
      <div class="header-actions">
        <span class="panel-tag">{{ progressStageLabel }}</span>
        <button
          v-if="canCancel"
          type="button"
          class="cancel-button"
          @click="handleCancel"
        >
          取消
        </button>
      </div>
    </div>

    <div class="progress-summary">
      <div class="summary-item">
        <span>当前目录</span>
        <strong>{{ copyProgress?.currentFile || "-" }}</strong>
      </div>
      <div class="summary-item">
        <span>进度</span>
        <strong>
          {{ copyProgress?.currentFileIndex || 0 }} /
          {{ copyProgress?.totalFiles || 0 }}
        </strong>
      </div>
      <div class="summary-item" v-if="copyProgress?.percentage !== undefined">
        <span>完成度</span>
        <strong>{{ Math.round(copyProgress.percentage) }}%</strong>
      </div>
      <div class="summary-item" v-if="(copyProgress?.totalBytes || 0) > 0">
        <span>速度</span>
        <strong>{{ formatSpeed(copyProgress?.speedBytesPerSecond || 0) }}</strong>
      </div>
      <div class="summary-item" v-if="(copyProgress?.totalBytes || 0) > 0">
        <span>数据</span>
        <strong>
          {{ formatBytes(copyProgress?.bytesCopied || 0) }} /
          {{ formatBytes(copyProgress?.totalBytes || 0) }}
        </strong>
      </div>
      <div
        class="summary-item"
        v-if="(copyProgress?.estimatedRemainingSeconds ?? 0) > 0"
      >
        <span>剩余时间</span>
        <strong>
          {{ formatTime(copyProgress?.estimatedRemainingSeconds) }}
        </strong>
      </div>
    </div>

    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: (copyProgress?.percentage || 0) + '%' }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CopyProgress } from '#main/types'
import { formatBytes, formatSpeed, formatTime } from '../composables/useFormatters'

const props = defineProps<{
  copyProgress: CopyProgress | null
  operationLabel: string
  isCopying: boolean
}>()

const canCancel = computed(
  () =>
    props.isCopying &&
    (props.copyProgress?.stage === 'preparing' ||
      props.copyProgress?.stage === 'copying')
)

function handleCancel() {
  if (props.isCopying && window.tilecopy) {
    window.tilecopy.cancelCopy()
  }
}

const progressStageLabel = computed(() => {
  switch (props.copyProgress?.stage) {
    case 'preparing':
      return '准备中'
    case 'copying':
      return '执行中'
    case 'completed':
      return '已完成'
    case 'error':
      return '执行异常'
    case 'cancelled':
      return '已取消'
    default:
      return '待开始'
  }
})
</script>

<style scoped>
.panel-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  background: transparent;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cancel-button {
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--red-border);
  background: transparent;
  color: #f0a1a1;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.cancel-button:hover {
  background: #201314;
}

.progress-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--line);
  background: var(--panel-muted);
  padding: 10px;
}

.summary-item span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.summary-item strong {
  display: block;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.progress-track {
  margin-top: 12px;
  height: 10px;
  border: 1px solid var(--line);
  background: var(--panel-muted);
}

.progress-fill {
  height: 100%;
  background: var(--blue);
  transition: width 0.2s ease;
}

@media (max-width: 900px) {
  .progress-summary {
    grid-template-columns: 1fr;
  }
}
</style>
