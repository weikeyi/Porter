<template>
  <div class="panel results-panel" v-if="preflightReports.length > 0">
    <div class="panel-header">
      <h2>预检结果</h2>
      <span class="panel-tag">共 {{ preflightReports.length }} 个区间</span>
    </div>

    <div class="summary-row">
      <div class="summary-item">
        <span>待{{ operationLabel }}目录</span>
        <strong>{{ totalRequested }}</strong>
      </div>
      <div class="summary-item">
        <span>缺失目录</span>
        <strong>{{ totalMissing }}</strong>
      </div>
      <div class="summary-item">
        <span>重复匹配</span>
        <strong>{{ totalDuplicates }}</strong>
      </div>
    </div>

    <details
      v-for="report in preflightReports"
      :key="report.detail.rangeLabel"
      class="range-block"
      open
    >
      <summary>
        <div>
          <strong>{{ report.detail.rangeLabel }}</strong>
          <span class="range-path" :title="report.detail.rangeSourcePath">
            {{ report.detail.rangeSourcePath }}
          </span>
        </div>
        <div class="range-stats">
          <span>待处理 {{ report.scan.summary.totalRequested }}</span>
          <span class="ok">匹配 {{ report.scan.summary.matched }}</span>
          <span v-if="report.scan.summary.missing > 0" class="missing">
            缺失 {{ report.scan.summary.missing }}
          </span>
          <span v-if="report.scan.summary.duplicates > 0" class="duplicate">
            重复 {{ report.scan.summary.duplicates }}
          </span>
        </div>
      </summary>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>目录名</th>
              <th>状态</th>
              <th>来源路径</th>
              <th>大小</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="finding in report.scan.findings"
              :key="finding.directory"
            >
              <td>{{ finding.directory }}</td>
              <td>
                <span :class="['status-chip', finding.status]">
                  {{ statusLabel(finding.status) }}
                </span>
              </td>
              <td>
                <template v-if="finding.matches.length > 0">
                  <span
                    v-for="match in finding.matches"
                    :key="match.sourcePath"
                    class="path-entry"
                  >
                    {{ match.sourcePath }}
                  </span>
                </template>
                <span v-else class="path-entry muted">未找到</span>
              </td>
              <td>
                <template v-if="finding.matches.length > 0">
                  <span
                    v-for="match in finding.matches"
                    :key="match.sourcePath"
                    class="path-entry"
                  >
                    {{
                      match.sizeInBytes > 0
                        ? formatBytes(match.sizeInBytes)
                        : "-"
                    }}
                  </span>
                </template>
                <span v-else class="muted">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PreflightReport } from '#main/types'
import { formatBytes, statusLabel } from '../composables/useFormatters'

const props = defineProps<{
  preflightReports: PreflightReport[]
  operationLabel: string
}>()

const totalRequested = computed(() =>
  props.preflightReports.reduce(
    (acc, report) => acc + report.scan.summary.totalRequested,
    0
  )
)

const totalMissing = computed(() =>
  props.preflightReports.reduce(
    (acc, report) => acc + report.scan.summary.missing,
    0
  )
)

const totalDuplicates = computed(() =>
  props.preflightReports.reduce(
    (acc, report) => acc + report.scan.summary.duplicates,
    0
  )
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
.status-chip,
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

.range-block {
  margin-top: 12px;
  border: 1px solid var(--line);
  background: var(--panel-muted);
}

.range-block summary {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  cursor: pointer;
  user-select: none;
}

.range-block summary::-webkit-details-marker {
  display: none;
}

.range-path {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  word-break: break-all;
}

.range-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.range-stats .ok,
.status-chip.ok,
.status-chip.exists {
  border-color: var(--green-border);
  color: #8fd0a4;
}

.range-stats .missing,
.status-chip.warn,
.status-chip.missing {
  border-color: var(--orange-border);
  color: #f4bc73;
}

.range-stats .duplicate,
.status-chip.duplicate {
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

.path-entry {
  display: block;
  line-height: 1.5;
  word-break: break-all;
}

.muted {
  color: #7f8791;
}

@media (max-width: 900px) {
  .panel-header,
  .range-block summary {
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
