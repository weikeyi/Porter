<template>
  <main class="app-shell">
    <header class="app-bar">
      <div class="title">
        <h1>Porter</h1>
        <span class="tagline">批量文件夹复制助手</span>
      </div>
      <p v-if="runtimeStatus" class="runtime-status">{{ runtimeStatus }}</p>
    </header>

    <section class="content">
      <!-- 路径配置面板 -->
      <div class="panel path-config">
        <h2>路径配置</h2>
        <div class="form-cols">
          <label>
            <span>主配置文件</span>
            <div class="input-with-button">
              <input
                v-model="form.mainConfigPath"
                placeholder="例如：D\\projects\\txt\\Tile_Export.txt 或 D\\tiles\\A001"
              />
              <button
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseMainConfig"
                title="选择配置文件 (.txt/.csv)"
              >
                选择文件
              </button>
              <button
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseMainConfigDirectory"
                title="选择目录作为配置列表"
              >
                选择目录
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
                :disabled="form.operation === 'delete'"
                :placeholder="
                  form.operation === 'delete'
                    ? '删除模式无需目标目录'
                    : '例如：E\\tiles\\backup'
                "
              />
              <button
                v-if="form.operation !== 'delete'"
                type="button"
                class="ghost-button"
                :disabled="isBusy"
                @click="chooseTargetRoot"
              >
                选择目录
              </button>
            </div>
          </label>
        </div>
      </div>

      <!-- 策略配置面板 -->
      <div class="panel strategy-config">
        <h2>策略配置</h2>
        <div class="form-grid">
          <label class="control-select">
            <span>操作类型</span>
            <div class="input-with-button">
              <select v-model="form.operation">
                <option value="copy">复制</option>
                <option value="move">移动</option>
                <option value="delete">删除</option>
              </select>
            </div>
          </label>

          <div class="mixed-control-group">
            <label class="flag">
              <span>动态发现子目录</span>
              <input type="checkbox" v-model="form.discoverRangeSubRoot" />
            </label>
            <label
              class="inline-input"
              :class="{ disabled: !form.discoverRangeSubRoot }"
            >
              <span>发现最大深度</span>
              <div class="input-with-button">
                <input
                  v-model.number="form.discoveryMaxDepth"
                  type="number"
                  min="1"
                  max="8"
                  placeholder="默认 4"
                  :disabled="!form.discoverRangeSubRoot"
                />
              </div>
            </label>
          </div>

          <label class="flag">
            <input type="checkbox" v-model="form.ignoreCase" />
            <span>忽略目录名大小写</span>
          </label>
          <label class="flag">
            <input type="checkbox" v-model="form.overwrite" />
            <span>目标已存在时覆盖</span>
          </label>
          <label class="flag">
            <input
              type="checkbox"
              v-model="form.purgeTargetFirst"
              :disabled="form.operation === 'delete'"
            />
            <span>目标已存在时先删除目标目录</span>
          </label>
          <label class="flag">
            <input type="checkbox" v-model="form.measureSize" />
            <span>扫描时统计目录大小</span>
          </label>
        </div>
        
        <div class="actions">
          <button :disabled="isBusy || !isFormValid" @click="handlePreflight">
            预检
          </button>
          <button
            :disabled="isBusy || preflightReports.length === 0"
            :class="actionClass"
            @click="handleCopy"
          >
            {{ actionLabel }}
          </button>
          <button
            type="button"
            class="ghost-button"
            :disabled="isBusy || isCopying"
            @click="handleReset"
          >
            重置
          </button>
        </div>
      </div>

        <!-- 复制进度条 -->
        <div class="copy-progress" v-if="isCopying || copyProgress">
          <div class="progress-header">
            <h3>{{ operationLabel }}进度</h3>
            <span class="percentage"
              >{{ copyProgress?.percentage.toFixed(1) || 0 }}%</span
            >
          </div>
          <div class="progress-bar-container">
            <div
              class="progress-bar"
              :style="{ width: (copyProgress?.percentage || 0) + '%' }"
            ></div>
          </div>
          <div class="progress-details">
            <div class="detail-item">
              <span class="label">当前文件:</span>
              <span class="value">{{ copyProgress?.currentFile || "-" }}</span>
            </div>
            <div class="detail-item">
              <span class="label">进度:</span>
              <span class="value">
                {{ copyProgress?.currentFileIndex || 0 }} /
                {{ copyProgress?.totalFiles || 0 }}
              </span>
            </div>
            <div class="detail-item" v-if="(copyProgress?.totalBytes || 0) > 0">
              <span class="label">速度:</span>
              <span class="value">{{
                formatSpeed(copyProgress?.speedBytesPerSecond || 0)
              }}</span>
            </div>
            <div class="detail-item" v-if="(copyProgress?.totalBytes || 0) > 0">
              <span class="label">已传输:</span>
              <span class="value">
                {{ formatBytes(copyProgress?.bytesCopied || 0) }} /
                {{ formatBytes(copyProgress?.totalBytes || 0) }}
              </span>
            </div>
            <div class="detail-item" v-if="(copyProgress?.totalBytes || 0) > 0">
              <span class="label">剩余时间:</span>
              <span class="value">{{
                formatTime(copyProgress?.estimatedRemainingSeconds)
              }}</span>
            </div>
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
            <strong>待{{ operationLabel }}目录</strong>
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
        </details>
      </div>

      <div class="panel results" v-if="copyOutcomes.length > 0">
        <h2>{{ operationLabel }}结果</h2>
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
                  已{{ operationLabel }} {{ outcome.copied.length }}
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
                    <template v-if="form.operation === 'delete'">
                      ✅ {{ copied.name }} (已删除)
                    </template>
                    <template v-else>
                      ✅ {{ copied.name }} → {{ copied.targetPath }}
                    </template>
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
  CopyProgress,
} from "#main/types";

const form = reactive({
  mainConfigPath: "",
  sourceRoot: "",
  targetRoot: "",
  ignoreCase: false,
  overwrite: false,
  purgeTargetFirst: false,
  measureSize: false,
  discoverRangeSubRoot: false,
  discoveryMaxDepth: 4,
  operation: "copy" as "copy" | "move" | "delete",
});

const isBusy = ref(false);
const runtimeStatus = ref<string>();
const configInfo = ref<null | { path: string; detailCount: number }>(null);
const preflightReports = ref<PreflightReport[]>([]);
const copyOutcomes = ref<CopyOutcome[]>([]);
const isCopying = ref(false);
const copyProgress = ref<CopyProgress | null>(null);

const jobRequest = computed<TileCopyJobRequest>(() => ({
  mainConfigPath: form.mainConfigPath.trim(),
  sourceRoot: form.sourceRoot.trim(),
  // 删除模式下目标目录可为空，传空字符串由后端忽略
  targetRoot: form.operation === "delete" ? "" : form.targetRoot.trim(),
  overwrite: form.overwrite,
  purgeTargetFirst: form.purgeTargetFirst,
  ignoreCase: form.ignoreCase,
  measureSize: form.measureSize,
  discoverRangeSubRoot: form.discoverRangeSubRoot,
  discoveryMaxDepth: form.discoveryMaxDepth,
  operation: form.operation,
}));

const isFormValid = computed(() => {
  const request = jobRequest.value;
  const basicValid =
    request.mainConfigPath.length > 0 && request.sourceRoot.length > 0;

  if (form.operation === "delete") {
    return basicValid;
  }
  return basicValid && request.targetRoot.length > 0;
});

const actionLabel = computed(() => {
  switch (form.operation) {
    case "copy":
      return "执行复制";
    case "move":
      return "执行移动";
    case "delete":
      return "执行删除";
    default:
      return "执行复制";
  }
});

const operationLabel = computed(() => {
  switch (form.operation) {
    case "copy":
      return "复制";
    case "move":
      return "移动";
    case "delete":
      return "删除";
    default:
      return "复制";
  }
});

const actionClass = computed(() => {
  if (form.operation === "delete") return "danger";
  if (form.operation === "move") return "warn";
  return "";
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
    return;
  }

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

async function chooseMainConfigDirectory() {
  if (!window.tilecopy) {
    return;
  }

  const selected = await window.tilecopy.selectMainConfigDirectory();
  if (selected) {
    form.mainConfigPath = selected;
  }
}

async function chooseTargetRoot() {
  if (!window.tilecopy || form.operation === "delete") {
    return;
  }

  const selected = await window.tilecopy.selectTargetRoot();
  if (selected) {
    form.targetRoot = selected;
  }
}

async function handlePreflight() {
  console.log('[App] handlePreflight clicked');
  if (!isFormValid.value || !window.tilecopy) {
    console.warn('[App] handlePreflight rejected: form invalid or API missing', { valid: isFormValid.value, api: !!window.tilecopy });
    return;
  }

  try {
    isBusy.value = true;
    runtimeStatus.value = "正在预检...";
    copyOutcomes.value = [];
    console.log('[App] invoking tilecopy.loadConfig', jobRequest.value);

    const config = await window.tilecopy.loadConfig(jobRequest.value);
    console.log('[App] config loaded', config);
    
    const reports = await window.tilecopy.preflight(jobRequest.value);
    console.log('[App] preflight reports received', reports);

    configInfo.value = {
      path: config.mainConfigPath,
      detailCount: config.detailConfigs.length,
    };
    preflightReports.value = reports;
    runtimeStatus.value = `已加载 ${reports.length} 个区间`;
  } catch (error) {
    console.error('[App] preflight error', error);
    runtimeStatus.value = formatError(error);
  } finally {
    isBusy.value = false;
  }
}

async function handleCopy() {
  if (!window.tilecopy || preflightReports.value.length === 0) {
    return;
  }

  // 二次确认逻辑
  if (form.operation === "delete") {
    const confirmDelete = window.confirm(
      `⚠️ 危险操作警告 ⚠️\n\n即将删除源目录中的文件！此操作不可恢复。\n\n确认要永久删除这些瓦片目录吗？`
    );
    if (!confirmDelete) return;

    // 再次确认，防止手滑
    const doubleCheck = window.confirm(
      `再次确认：真的要删除吗？\n请确保数据已备份或不再需要。`
    );
    if (!doubleCheck) return;
  }

  try {
    isBusy.value = true;
    isCopying.value = true;
    runtimeStatus.value = `正在${
      form.operation === "delete" ? "删除" : "处理"
    }...`;

    // 设置进度监听器
    window.tilecopy.onCopyProgress((progress) => {
      copyProgress.value = progress;
    });

    const outcome = await window.tilecopy.executeCopy(jobRequest.value);
    copyOutcomes.value = outcome;
    runtimeStatus.value = "操作流程完成";
  } catch (error) {
    runtimeStatus.value = formatError(error);
    // 如果出错，也可以显示错误信息
    if (copyProgress.value) {
      copyProgress.value = {
        ...copyProgress.value,
        stage: "error",
        errorMessage: error instanceof Error ? error.message : "未知错误",
      };
    }
  } finally {
    isBusy.value = false;
    // 复制完成后保留最终进度
    setTimeout(() => {
      isCopying.value = false;
    }, 2000);
  }
}

function handleReset() {
  if (isBusy.value || isCopying.value) {
    return;
  }

  const confirmed = window.confirm(
    "确认要重置所有配置和结果吗？当前预检和复制结果将被清空。"
  );
  if (!confirmed) {
    return;
  }

  form.mainConfigPath = "";
  form.sourceRoot = "";
  form.targetRoot = "";
  form.ignoreCase = true;
  form.overwrite = false;
  form.purgeTargetFirst = false;
  form.measureSize = false;
  form.discoverRangeSubRoot = true;
  form.discoveryMaxDepth = 4;
  form.operation = "copy"; // reset to default

  configInfo.value = null;
  preflightReports.value = [];
  copyOutcomes.value = [];
  copyProgress.value = null;
  runtimeStatus.value = undefined;
  isCopying.value = false;
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

function formatSpeed(bytesPerSecond: number) {
  if (bytesPerSecond === 0) return "0 B/s";
  return formatBytes(bytesPerSecond) + "/s";
}

function formatTime(seconds?: number) {
  if (!seconds || seconds < 0) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}分${secs}秒`;
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
  gap: 1.5rem;
}

.form-cols {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

input:disabled,
select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

select {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(100, 116, 139, 0.4);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  color: #e2e8f0;
  font-size: 0.95rem;
}

select:focus {
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

.input-with-button select {
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
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(30, 41, 59, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.flag:hover {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(30, 41, 59, 0.8);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.4);
  transform: translateY(-2px);
}

.flag span {
  flex: 1;
  font-weight: 500;
  font-size: 0.95rem;
  color: rgba(226, 232, 240, 0.9);
  transition: color 0.3s ease;
}

.flag:hover span {
  color: #fff;
}

/* Toggle Switch Design */
.flag input[type="checkbox"] {
  appearance: none;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  position: relative;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  order: 1; /* Move switch to the right */
}

/* Thumb */
.flag input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e2e8f0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease;
}

/* Checked State */
.flag input[type="checkbox"]:checked {
  background: #38bdf8;
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
}

.flag input[type="checkbox"]:checked::after {
  transform: translateX(20px);
  background: #fff;
}

/* Focus State */
.flag input[type="checkbox"]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.35);
}

/* Disabled State */
.flag input[type="checkbox"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.flag input[type="checkbox"]:disabled + span {
  color: rgba(148, 163, 184, 0.5);
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

button.warn {
  background: #fbbf24;
  color: #0f172a;
}

button.danger {
  background: #f87171;
  color: #0f172a;
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

/* 复制进度条样式 */
.copy-progress {
  margin-top: 1.5rem;
  padding: 1.25rem;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 12px;
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.progress-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #38bdf8;
}

.progress-header .percentage {
  font-size: 1.25rem;
  font-weight: 600;
  color: #4ade80;
}

.progress-bar-container {
  width: 100%;
  height: 12px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #0ea5e9);
  border-radius: 999px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  position: relative;
  overflow: hidden;
}

.progress-bar::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.progress-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.detail-item .label {
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.8);
  font-weight: 500;
}

.detail-item .value {
  font-size: 0.95rem;
  color: #e2e8f0;
  font-weight: 600;
  word-break: break-all;
}

.mixed-control-group {
  grid-column: 1 / -1;
  display: flex;
  align-items: stretch;
  gap: 1rem;
}

@media (max-width: 600px) {
  .mixed-control-group {
    flex-direction: column;
  }
}

.inline-input {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35rem;
  min-width: 120px;
  transition: opacity 0.2s ease;
}

.inline-input.disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
