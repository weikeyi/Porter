<template>
  <div class="panel config-panel">
    <div class="panel-header">
      <div>
        <h2>配置</h2>
        <p v-if="configInfo?.path" class="panel-subtext" :title="configInfo.path">
          {{ formatPathPreview(configInfo.path, 96) }}
        </p>
      </div>
      <span v-if="configInfo" class="panel-tag">
        {{ configInfo.detailCount }} 个区间
      </span>
    </div>

    <div class="field-list">
      <label class="field-block">
        <span class="field-label">主配置文件</span>
        <div class="field-control">
          <input
            v-model="form.mainConfigPath"
            placeholder="例如：D:\\projects\\txt\\Tile_Export.txt 或 D:\\tiles\\A001"
          />
          <button
            type="button"
            class="ghost-button"
            :disabled="isBusy"
            @click="$emit('choose-main-config')"
            title="选择配置文件 (.txt/.csv)"
          >
            选择文件
          </button>
          <button
            type="button"
            class="ghost-button"
            :disabled="isBusy"
            @click="$emit('choose-main-config-directory')"
            title="选择目录作为配置列表"
          >
            选择目录
          </button>
        </div>
      </label>

      <label class="field-block">
        <span class="field-label">源目录</span>
        <div class="field-control">
          <input
            v-model="form.sourceRoot"
            placeholder="例如：D:\\tiles\\source"
          />
          <button
            type="button"
            class="ghost-button"
            :disabled="isBusy"
            @click="$emit('choose-source-root')"
          >
            选择目录
          </button>
        </div>
      </label>

      <label class="field-block">
        <span class="field-label">目标目录</span>
        <div class="field-control">
          <input
            v-model="form.targetRoot"
            :disabled="form.operation === 'delete'"
            :placeholder="
              form.operation === 'delete'
                ? '删除模式无需目标目录'
                : '例如：E:\\tiles\\backup'
            "
          />
          <button
            v-if="form.operation !== 'delete'"
            type="button"
            class="ghost-button"
            :disabled="isBusy"
            @click="$emit('choose-target-root')"
          >
            选择目录
          </button>
        </div>
      </label>
    </div>

    <div class="config-grid">
      <div class="option-block option-block-wide">
        <span class="field-label">操作类型</span>
        <div class="mode-tabs">
          <button
            type="button"
            :class="['mode-tab', { active: form.operation === 'copy' }]"
            @click="form.operation = 'copy'"
          >
            复制
          </button>
          <button
            type="button"
            :class="['mode-tab', { active: form.operation === 'move' }]"
            @click="form.operation = 'move'"
          >
            移动
          </button>
          <button
            type="button"
            :class="['mode-tab', 'danger', { active: form.operation === 'delete' }]"
            @click="form.operation = 'delete'"
          >
            删除
          </button>
        </div>
      </div>

      <label class="option-block">
        <span class="field-label">目标已存在时策略</span>
        <select
          v-model="form.conflictStrategy"
          :disabled="form.operation === 'delete'"
        >
          <option value="skip">跳过已存在</option>
          <option value="overwrite">覆盖并合并</option>
          <option value="purge">先删除旧目录再复制</option>
        </select>
      </label>

      <label class="option-block">
        <span class="field-label">发现最大深度</span>
        <input
          v-model.number="form.discoveryMaxDepth"
          type="number"
          min="1"
          max="8"
          :disabled="!form.discoverRangeSubRoot"
        />
      </label>
    </div>

    <div class="check-row">
      <label class="check-item">
        <input type="checkbox" v-model="form.discoverRangeSubRoot" />
        <span>动态发现子目录</span>
      </label>
      <label class="check-item">
        <input type="checkbox" v-model="form.ignoreCase" />
        <span>忽略目录名大小写</span>
      </label>
      <label class="check-item">
        <input type="checkbox" v-model="form.measureSize" />
        <span>扫描时统计目录大小</span>
      </label>
    </div>

    <p v-if="form.operation === 'delete'" class="inline-note danger">
      删除模式不会使用目标目录，请先预检确认范围。
    </p>

    <div
      v-if="isPreflightStale || configErrors.length > 0"
      class="inline-alerts"
    >
      <p v-if="isPreflightStale" class="alert-line warn">
        当前配置已变更，请重新预检后再执行。
      </p>
      <div v-if="configErrors.length > 0" class="alert-block danger">
        <strong>配置存在问题</strong>
        <ul>
          <li v-for="error in configErrors" :key="error">
            {{ error }}
          </li>
        </ul>
      </div>
    </div>

    <div class="action-row">
      <button :disabled="isBusy || !isFormValid" @click="$emit('preflight')">
        预检
      </button>
      <button
        :disabled="!canExecuteAction"
        :class="actionClass"
        @click="$emit('execute')"
      >
        {{ actionLabel }}
      </button>
      <button
        type="button"
        class="ghost-button"
        :disabled="isBusy || isCopying"
        @click="$emit('reset')"
      >
        重置
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatPathPreview } from '../composables/useFormatters'

defineProps<{
  form: {
    mainConfigPath: string
    sourceRoot: string
    targetRoot: string
    ignoreCase: boolean
    conflictStrategy: 'skip' | 'overwrite' | 'purge'
    measureSize: boolean
    discoverRangeSubRoot: boolean
    discoveryMaxDepth: number
    operation: 'copy' | 'move' | 'delete'
  }
  configInfo: null | { path: string; detailCount: number }
  configErrors: string[]
  isBusy: boolean
  isCopying: boolean
  isFormValid: boolean
  canExecuteAction: boolean
  isPreflightStale: boolean
  actionLabel: string
  operationLabel: string
  actionClass: string
}>()

defineEmits<{
  preflight: []
  execute: []
  reset: []
  'choose-main-config': []
  'choose-main-config-directory': []
  'choose-source-root': []
  'choose-target-root': []
}>()
</script>

<style scoped>
.field-label {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

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

.field-list {
  display: grid;
  gap: 10px;
}

.field-block,
.option-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-control {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-control input {
  flex: 1 1 320px;
}

.config-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 140px;
  gap: 10px;
  margin-top: 12px;
}

.option-block-wide {
  min-width: 0;
}

.mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.mode-tab {
  border-color: var(--line-strong);
  background: var(--panel-muted);
  color: var(--text);
}

.mode-tab:hover {
  background: #1a1f25;
}

.mode-tab.active {
  border-color: var(--blue-border);
  background: #1a2d57;
}

.mode-tab.danger.active {
  border-color: var(--red-border);
  background: #3a1719;
}

.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
}

.check-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 13px;
}

.check-item input {
  width: 14px;
  height: 14px;
  min-height: auto;
  padding: 0;
}

.inline-note {
  margin: 12px 0 0;
  padding: 9px 10px;
  border: 1px solid var(--line);
  background: var(--panel-muted);
  color: var(--muted);
  font-size: 13px;
}

.inline-note.danger,
.alert-block.danger {
  border-color: var(--red-border);
  background: #201314;
  color: #f0a1a1;
}

.inline-alerts {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.alert-line,
.alert-block {
  padding: 10px;
  border: 1px solid var(--line);
  background: var(--panel-muted);
  font-size: 13px;
}

.alert-line.warn {
  border-color: var(--orange-border);
  color: #f4bc73;
}

.alert-block strong {
  display: block;
  margin-bottom: 6px;
}

.alert-block ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

@media (max-width: 900px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .field-control,
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .mode-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
