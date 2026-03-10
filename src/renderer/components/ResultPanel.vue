<template>
  <div class="panel results-panel" v-if="copyOutcomes.length > 0">
    <div class="panel-header">
      <h2>{{ operationLabel }}结果</h2>
      <span class="panel-tag">
        {{ resultSuccessCount }} 成功 / {{ resultFailedCount }} 失败
      </span>
    </div>

    <div class="summary-row">
      <div class="summary-item">
        <span>成功</span>
        <strong>{{ resultSuccessCount }}</strong>
      </div>
      <div class="summary-item">
        <span>已存在</span>
        <strong>{{ resultSkippedCount }}</strong>
      </div>
      <div class="summary-item">
        <span>缺失</span>
        <strong>{{ resultMissingCount }}</strong>
      </div>
      <div class="summary-item">
        <span>失败</span>
        <strong>{{ resultFailedCount }}</strong>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>区间</th>
            <th>结果</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="outcome in copyOutcomes"
            :key="outcome.detail.rangeLabel"
          >
            <td>{{ outcome.detail.rangeLabel }}</td>
            <td>
              <div class="range-stats">
                <span class="ok" v-if="outcome.copied.length > 0">
                  已{{ operationLabel }} {{ outcome.copied.length }}
                </span>
                <span
                  class="missing"
                  v-if="outcome.skippedExists.length > 0"
                >
                  已存在 {{ outcome.skippedExists.length }}
                </span>
                <span
                  class="missing"
                  v-if="outcome.missing.length > 0"
                >
                  缺失 {{ outcome.missing.length }}
                </span>
                <span
                  class="duplicate"
                  v-if="outcome.failed.length > 0"
                >
                  失败 {{ outcome.failed.length }}
                </span>
              </div>
            </td>
            <td>
              <ul class="result-list">
                <li
                  v-for="copied in outcome.copied"
                  :key="`copied-${copied.targetPath}`"
                >
                  <template v-if="operation === 'delete'">
                    ✅ {{ copied.name }} (已删除)
                  </template>
                  <template v-else>
                    ✅ {{ copied.name }} → {{ copied.targetPath }}
                  </template>
                </li>
                <li
                  v-for="skip in outcome.skippedExists"
                  :key="`skip-${skip.targetPath}`"
                >
                  ⏭️ {{ skip.name }} (已存在)
                </li>
                <li
                  v-for="missingName in outcome.missing"
                  :key="`missing-${missingName}`"
                >
                  ⚠️ {{ missingName }} (源目录缺失)
                </li>
                <li
                  v-for="failure in outcome.failed"
                  :key="`failed-${failure.name}-${failure.reason}`"
                >
                  ❌ {{ failure.name }} ({{ failure.reason }})
                </li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CopyOutcome } from '#main/types'

const props = defineProps<{
  copyOutcomes: CopyOutcome[]
  operationLabel: string
  operation: 'copy' | 'move' | 'delete'
}>()

const resultSuccessCount = computed(() =>
  props.copyOutcomes.reduce((acc, outcome) => acc + outcome.copied.length, 0)
)

const resultSkippedCount = computed(() =>
  props.copyOutcomes.reduce(
    (acc, outcome) => acc + outcome.skippedExists.length,
    0
  )
)

const resultMissingCount = computed(() =>
  props.copyOutcomes.reduce((acc, outcome) => acc + outcome.missing.length, 0)
)

const resultFailedCount = computed(() =>
  props.copyOutcomes.reduce((acc, outcome) => acc + outcome.failed.length, 0)
)
</script>

<style scoped>
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.panel-tag,
.range-stats span {
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

.summary-row {
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

.range-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.range-stats .ok {
  border-color: var(--green-border);
  color: #8fd0a4;
}

.range-stats .missing {
  border-color: var(--orange-border);
  color: #f4bc73;
}

.range-stats .duplicate {
  border-color: var(--red-border);
  color: #f0a1a1;
}

.table-wrap {
  overflow: auto;
  border-top: 1px solid var(--line);
}

table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
}

thead {
  background: #14181d;
  text-align: left;
}

th,
td {
  padding: 10px;
  border-bottom: 1px solid #252c33;
  vertical-align: top;
}

tbody tr:hover {
  background: #1a1f25;
}

.result-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.result-list li {
  display: block;
  line-height: 1.5;
  word-break: break-all;
}

@media (max-width: 900px) {
  .panel-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  table {
    min-width: 600px;
  }
}
</style>
