<template>
  <main class="app-shell">
    <header class="app-bar">
      <div class="title">
        <h1>TileCopy</h1>
        <span class="tagline">批量 Tile 目录复制助手</span>
      </div>
      <p v-if="runtimeStatus" class="runtime-status">{{ runtimeStatus }}</p>
    </header>

    <section class="content">
      <div class="panel">
        <h2>基础配置</h2>
        <div class="form-grid">
          <label>
            <span>主配置文件</span>
            <div class="input-with-button">
              <input
                v-model="form.mainConfigPath"
                placeholder="例如：D\\projects\\txt\\Tile_Export.txt"
              />
              <button
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseMainConfig"
              >
                选择文件
              </button>
            </div>
          </label>
          <label>
            <span>源目录 (Tile 根)</span>
            <div class="input-with-button">
              <input
                v-model="form.sourceRoot"
                placeholder="例如：D\\tiles\\source"
              />
              <button
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseSourceRoot"
              >
                选择目录
              </button>
            </div>
          </label>
          <label>
            <span>目标目录</span>
            <div class="input-with-button">
              <input
                v-model="form.targetRoot"
                placeholder="例如：E\\tiles\\backup"
              />
              <button
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseTargetRoot"
              >
                选择目录
              </button>
            </div>
          </label>
          <label class="flag">
            <input type="checkbox" v-model="form.ignoreCase" />
            <span>忽略目录名大小写</span>
          </label>
          <label class="flag">
            <input type="checkbox" v-model="form.overwrite" />
            <span>目标已存在时覆盖</span>
          </label>
        </div>
        <div class="actions">
          <button :disabled="isBusy || !isFormValid" @click="handlePreflight">
            预检
          </button>
          <button
            :disabled="isBusy || preflightReports.length === 0"
            @click="handleCopy"
          >
            执行复制
          </button>
        </div>
      </div>

      <div class="panel results" v-if="preflightReports.length > 0">
        <h2>预检结果</h2>
        <div class="summary">
          <div class="card">
            <strong>共计区间</strong>
            <span>{{ preflightReports.length }}</span>
          </div>
          <div class="card">
            <strong>待复制目录</strong>
            <span>{{ totalRequested }}</span>
          </div>
          <div class="card warn" v-if="totalMissing > 0">
            <strong>缺失目录</strong>
            <span>{{ totalMissing }}</span>
          </div>
          <div class="card warn" v-if="totalDuplicates > 0">
            <strong>重复匹配</strong>
            <span>{{ totalDuplicates }}</span>
          </div>
        </div>

        <details
          v-for="report in preflightReports"
          :key="report.detail.rangeLabel"
          open
        >
          <summary>
            <div>
              <strong>{{ report.detail.rangeLabel }}</strong>
              <span class="range-path">{{
                report.detail.rangeSourcePath
              }}</span>
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
                    >
                      {{ formatBytes(match.sizeInBytes) }}
                    </span>
                  </template>
                  <span v-else class="muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>

      <div class="panel results" v-if="copyOutcomes.length > 0">
        <h2>复制结果</h2>
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
                <span class="status-chip ok" v-if="outcome.copied.length > 0">
                  已复制 {{ outcome.copied.length }}
                </span>
                <span
                  class="status-chip warn"
                  v-if="outcome.skippedExists.length > 0"
                >
                  已存在 {{ outcome.skippedExists.length }}
                </span>
                <span
                  class="status-chip missing"
                  v-if="outcome.missing.length > 0"
                >
                  缺失 {{ outcome.missing.length }}
                </span>
                <span
                  class="status-chip duplicate"
                  v-if="outcome.failed.length > 0"
                >
                  失败 {{ outcome.failed.length }}
                </span>
              </td>
              <td>
                <ul>
                  <li v-for="copied in outcome.copied" :key="copied.targetPath">
                    ✅ {{ copied.name }} → {{ copied.targetPath }}
                  </li>
                  <li
                    v-for="skip in outcome.skippedExists"
                    :key="skip.targetPath"
                  >
                    ⏭️ {{ skip.name }} (已存在)
                  </li>
                  <li v-for="missingName in outcome.missing" :key="missingName">
                    ⚠️ {{ missingName }} (源目录缺失)
                  </li>
                  <li v-for="failure in outcome.failed" :key="failure.name">
                    ❌ {{ failure.name }} ({{ failure.reason }})
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type {
  TileCopyJobRequest,
  PreflightReport,
  CopyOutcome,
} from "#main/types";

const form = reactive({
  mainConfigPath: "",
  sourceRoot: "",
  targetRoot: "",
  ignoreCase: true,
  overwrite: false,
});

const isBusy = ref(false);
const runtimeStatus = ref<string>();
const configInfo = ref<null | { path: string; detailCount: number }>(null);
const preflightReports = ref<PreflightReport[]>([]);
const copyOutcomes = ref<CopyOutcome[]>([]);

const jobRequest = computed<TileCopyJobRequest>(() => ({
  mainConfigPath: form.mainConfigPath.trim(),
  sourceRoot: form.sourceRoot.trim(),
  targetRoot: form.targetRoot.trim(),
  overwrite: form.overwrite,
  ignoreCase: form.ignoreCase,
}));

const isFormValid = computed(() => {
  const request = jobRequest.value;
  return (
    request.mainConfigPath.length > 0 &&
    request.sourceRoot.length > 0 &&
    request.targetRoot.length > 0
  );
});

const totalRequested = computed(() =>
  preflightReports.value.reduce(
    (acc, report) => acc + report.scan.summary.totalRequested,
    0
  )
);

const totalMissing = computed(() =>
  preflightReports.value.reduce(
    (acc, report) => acc + report.scan.summary.missing,
    0
  )
);

const totalDuplicates = computed(() =>
  preflightReports.value.reduce(
    (acc, report) => acc + report.scan.summary.duplicates,
    0
  )
);

async function chooseMainConfig() {
  if (!window.tilecopy) {
    console.log("test1");
    return;
  }
  console.log("test");
  const selected = await window.tilecopy.selectMainConfig();
  if (selected) {
    form.mainConfigPath = selected;
  }
}

async function chooseSourceRoot() {
  if (!window.tilecopy) {
    return;
  }

  const selected = await window.tilecopy.selectSourceRoot();
  if (selected) {
    form.sourceRoot = selected;
  }
}

async function chooseTargetRoot() {
  if (!window.tilecopy) {
    return;
  }

  const selected = await window.tilecopy.selectTargetRoot();
  if (selected) {
    form.targetRoot = selected;
  }
}

async function handlePreflight() {
  if (!isFormValid.value || !window.tilecopy) {
    return;
  }

  try {
    isBusy.value = true;
    runtimeStatus.value = "正在预检...";
    copyOutcomes.value = [];

    const config = await window.tilecopy.loadConfig(jobRequest.value);
    const reports = await window.tilecopy.preflight(jobRequest.value);

    configInfo.value = {
      path: config.mainConfigPath,
      detailCount: config.detailConfigs.length,
    };
    preflightReports.value = reports;
    runtimeStatus.value = `已加载 ${reports.length} 个区间`;
  } catch (error) {
    runtimeStatus.value = formatError(error);
  } finally {
    isBusy.value = false;
  }
}

async function handleCopy() {
  if (!window.tilecopy || preflightReports.value.length === 0) {
    return;
  }

  try {
    isBusy.value = true;
    runtimeStatus.value = "正在复制...";

    const outcome = await window.tilecopy.executeCopy(jobRequest.value);
    copyOutcomes.value = outcome;
    runtimeStatus.value = "复制流程完成";
  } catch (error) {
    runtimeStatus.value = formatError(error);
  } finally {
    isBusy.value = false;
  }
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function statusLabel(status: "missing" | "exists" | "duplicate") {
  switch (status) {
    case "missing":
      return "缺失";
    case "exists":
      return "已匹配";
    case "duplicate":
      return "重复";
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return `错误: ${error.message}`;
  }
  return "发生未知错误";
}

void (async () => {
  if (!window.tilecopy) return;
  const pong = await window.tilecopy.ping();
  runtimeStatus.value = `服务就绪 (${pong})`;
})();
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

.app-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background: linear-gradient(135deg, #1f2937, #0f172a);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.title h1 {
  margin: 0;
  font-size: 1.75rem;
}

.tagline {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.7);
}

.runtime-status {
  font-size: 0.95rem;
  color: #38bdf8;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 2rem 3rem;
  overflow-y: auto;
}

.panel {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.4);
}

.panel h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}

input {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(100, 116, 139, 0.4);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  color: #e2e8f0;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  font-size: 0.95rem;
}

input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}

.input-with-button {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.input-with-button input {
  flex: 1;
}

button.ghost-button {
  background: transparent;
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.6);
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font-weight: 500;
  box-shadow: none;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

button.ghost-button:hover {
  background: rgba(56, 189, 248, 0.15);
  color: #0f172a;
}

button.ghost-button:disabled {
  opacity: 0.6;
  color: rgba(148, 163, 184, 0.8);
  border-color: rgba(148, 163, 184, 0.4);
  background: transparent;
  cursor: not-allowed;
}

.flag {
  flex-direction: row;
  align-items: center;
  gap: 0.6rem;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.25rem;
}

button {
  background: #38bdf8;
  color: #0f172a;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(56, 189, 248, 0.3);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.results details {
  margin-top: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.9);
}

.results summary {
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.range-path {
  display: block;
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.7);
}

.range-stats {
  display: flex;
  gap: 0.75rem;
  font-size: 0.9rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

thead {
  background: rgba(30, 41, 59, 0.8);
  text-align: left;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
}

.status-chip.exists,
.status-chip.ok {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.status-chip.missing,
.status-chip.warn {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.status-chip.duplicate {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.path-entry {
  display: block;
  word-break: break-all;
  color: rgba(226, 232, 240, 0.9);
}

.muted {
  color: rgba(148, 163, 184, 0.6);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1rem 0;
}

.summary .card {
  min-width: 140px;
  padding: 1rem 1.25rem;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  text-align: center;
}

.summary .card.warn {
  border-color: rgba(248, 113, 113, 0.4);
}

.summary .card strong {
  display: block;
  margin-bottom: 0.35rem;
  color: #e2e8f0;
}

.summary .card span {
  font-size: 1.25rem;
  font-weight: 600;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}

li {
  color: rgba(226, 232, 240, 0.9);
}
</style>
