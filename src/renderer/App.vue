<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="topbar-title">
        <h1>Porter</h1>
        <p>Tile 目录批量处理</p>
      </div>
      <div class="topbar-status">
        <span class="section-label">状态</span>
        <strong :class="['status-text', runtimeTone]">
          {{ runtimeStatus || "等待操作" }}
        </strong>
      </div>
    </header>

    <section class="content">
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

          <label class="field-block">
            <span class="field-label">源目录</span>
            <div class="field-control">
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

          <label class="field-block">
            <span class="field-label">目标目录</span>
            <div class="field-control">
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
          <button :disabled="isBusy || !isFormValid" @click="handlePreflight">
            预检
          </button>
          <button
            :disabled="!canExecuteAction"
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

      <div class="panel progress-panel" v-if="isCopying || copyProgress">
        <div class="panel-header">
          <h2>{{ operationLabel }}进度</h2>
          <span class="panel-tag">{{ progressStageLabel }}</span>
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
        </div>

        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: (copyProgress?.percentage || 0) + '%' }"
          ></div>
        </div>
      </div>

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
                      <template v-if="form.operation === 'delete'">
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
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
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
  ignoreCase: true,
  conflictStrategy: "skip" as "skip" | "overwrite" | "purge",
  measureSize: false,
  discoverRangeSubRoot: true,
  discoveryMaxDepth: 4,
  operation: "copy" as "copy" | "move" | "delete",
});

const isBusy = ref(false);
const runtimeStatus = ref<string | undefined>("启动中...");
const configInfo = ref<null | { path: string; detailCount: number }>(null);
const configErrors = ref<string[]>([]);
const preflightReports = ref<PreflightReport[]>([]);
const copyOutcomes = ref<CopyOutcome[]>([]);
const isCopying = ref(false);
const copyProgress = ref<CopyProgress | null>(null);
const lastPreflightSignature = ref<string | null>(null);
let removeCopyProgressListener: null | (() => void) = null;

const jobRequest = computed<TileCopyJobRequest>(() => ({
  mainConfigPath: form.mainConfigPath.trim(),
  sourceRoot: form.sourceRoot.trim(),
  // 删除模式下目标目录可为空，传空字符串由后端忽略
  targetRoot: form.operation === "delete" ? "" : form.targetRoot.trim(),
  overwrite: form.conflictStrategy === "overwrite",
  purgeTargetFirst: form.conflictStrategy === "purge",
  ignoreCase: form.ignoreCase,
  measureSize: form.measureSize,
  discoverRangeSubRoot: form.discoverRangeSubRoot,
  discoveryMaxDepth: form.discoveryMaxDepth,
  operation: form.operation,
}));

const currentRequestSignature = computed(() =>
  JSON.stringify({
    mainConfigPath: jobRequest.value.mainConfigPath,
    sourceRoot: jobRequest.value.sourceRoot,
    targetRoot: jobRequest.value.targetRoot,
    overwrite: jobRequest.value.overwrite,
    purgeTargetFirst: jobRequest.value.purgeTargetFirst,
    ignoreCase: jobRequest.value.ignoreCase,
    measureSize: jobRequest.value.measureSize,
    discoverRangeSubRoot: jobRequest.value.discoverRangeSubRoot ?? false,
    discoveryMaxDepth: jobRequest.value.discoveryMaxDepth ?? null,
    operation: jobRequest.value.operation,
  })
);

const isPreflightStale = computed(
  () =>
    preflightReports.value.length > 0 &&
    lastPreflightSignature.value !== currentRequestSignature.value
);

const hasConfigErrors = computed(() => configErrors.value.length > 0);

const canExecuteAction = computed(
  () =>
    !isBusy.value &&
    preflightReports.value.length > 0 &&
    !isPreflightStale.value &&
    !hasConfigErrors.value
);

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

const runtimeTone = computed(() => {
  const value = runtimeStatus.value ?? "";
  if (!value) return "neutral";
  if (value.startsWith("错误")) return "danger";
  if (value.includes("完成") || value.includes("就绪")) return "ok";
  if (value.includes("预检") || value.includes("处理") || value.includes("删除")) {
    return "active";
  }
  return "neutral";
});

const resultSuccessCount = computed(() =>
  copyOutcomes.value.reduce((acc, outcome) => acc + outcome.copied.length, 0)
);

const resultSkippedCount = computed(() =>
  copyOutcomes.value.reduce(
    (acc, outcome) => acc + outcome.skippedExists.length,
    0
  )
);

const resultMissingCount = computed(() =>
  copyOutcomes.value.reduce((acc, outcome) => acc + outcome.missing.length, 0)
);

const resultFailedCount = computed(() =>
  copyOutcomes.value.reduce((acc, outcome) => acc + outcome.failed.length, 0)
);

const progressStageLabel = computed(() => {
  switch (copyProgress.value?.stage) {
    case "preparing":
      return "准备中";
    case "copying":
      return "执行中";
    case "completed":
      return "已完成";
    case "error":
      return "执行异常";
    default:
      return "待开始";
  }
});

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
    configErrors.value = [];
    lastPreflightSignature.value = null;
    preflightReports.value = [];
    copyOutcomes.value = [];
    copyProgress.value = null;
    console.log('[App] invoking tilecopy.loadConfig', jobRequest.value);

    const config = await window.tilecopy.loadConfig(jobRequest.value);
    console.log('[App] config loaded', config);
    
    const reports = await window.tilecopy.preflight(jobRequest.value);
    console.log('[App] preflight reports received', reports);

    configInfo.value = {
      path: config.mainConfigPath,
      detailCount: config.detailConfigs.length,
    };
    configErrors.value = config.errors;
    preflightReports.value = reports;
    lastPreflightSignature.value = currentRequestSignature.value;
    runtimeStatus.value =
      config.errors.length > 0
        ? `已加载 ${reports.length} 个区间，但存在 ${config.errors.length} 条配置问题，请修复后再执行`
        : `已加载 ${reports.length} 个区间`;
  } catch (error) {
    console.error('[App] preflight error', error);
    configErrors.value = [];
    lastPreflightSignature.value = null;
    preflightReports.value = [];
    runtimeStatus.value = formatError(error);
  } finally {
    isBusy.value = false;
  }
}

async function handleCopy() {
  if (!window.tilecopy || preflightReports.value.length === 0) {
    return;
  }

  if (hasConfigErrors.value) {
    runtimeStatus.value = "配置存在问题，请修复后重新预检。";
    return;
  }

  if (isPreflightStale.value) {
    runtimeStatus.value = "配置已变更，请重新预检后再执行。";
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
    removeCopyProgressListener?.();
    removeCopyProgressListener = window.tilecopy.onCopyProgress((progress) => {
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
    removeCopyProgressListener?.();
    removeCopyProgressListener = null;
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
  form.conflictStrategy = "skip";
  form.measureSize = false;
  form.discoverRangeSubRoot = true;
  form.discoveryMaxDepth = 4;
  form.operation = "copy"; // reset to default

  configInfo.value = null;
  configErrors.value = [];
  preflightReports.value = [];
  copyOutcomes.value = [];
  copyProgress.value = null;
  lastPreflightSignature.value = null;
  removeCopyProgressListener?.();
  removeCopyProgressListener = null;
  runtimeStatus.value = undefined;
  isCopying.value = false;
}

onBeforeUnmount(() => {
  removeCopyProgressListener?.();
  removeCopyProgressListener = null;
});

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

function formatPathPreview(value: string, maxLength = 42) {
  if (value.length <= maxLength) {
    return value;
  }

  const tailLength = Math.max(18, maxLength - 4);
  return `...${value.slice(-tailLength)}`;
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
  --bg: #111418;
  --panel: #181c21;
  --panel-muted: #14181d;
  --line: #2a3138;
  --line-strong: #39424c;
  --text: #e7eaee;
  --muted: #97a0aa;
  --blue: #1d4ed8;
  --blue-border: #2859b8;
  --green-border: #2d6a43;
  --orange-border: #85511a;
  --red-border: #8c3434;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.topbar-title h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
}

.topbar-title p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.topbar-status {
  min-width: 260px;
  border: 1px solid var(--line);
  background: var(--panel-muted);
  padding: 10px 12px;
}

.section-label,
.field-label {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.status-text {
  display: block;
  margin-top: 6px;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 700;
}

.status-text.ok {
  color: #8fd0a4;
}

.status-text.active {
  color: #9fc1ff;
}

.status-text.danger {
  color: #f0a1a1;
}

.status-text.neutral {
  color: var(--text);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px 20px;
}

.panel {
  border: 1px solid var(--line);
  background: var(--panel);
  padding: 14px;
}

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

.panel-subtext {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
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

input,
select {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  background: var(--panel-muted);
  color: var(--text);
  font: inherit;
}

input::placeholder {
  color: #6f7882;
}

input:focus,
select:focus {
  outline: none;
  border-color: #59636f;
}

input:disabled,
select:disabled,
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button {
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid var(--blue-border);
  background: var(--blue);
  color: #f8fafc;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: #1e40af;
}

button.warn {
  border-color: var(--orange-border);
  background: #b45309;
}

button.warn:hover {
  background: #92400e;
}

button.danger {
  border-color: var(--red-border);
  background: #b91c1c;
}

button.danger:hover {
  background: #991b1b;
}

.ghost-button {
  border-color: var(--line-strong);
  background: var(--panel-muted);
  color: var(--text);
}

.ghost-button:hover {
  background: #1a1f25;
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

.alert-block ul,
.result-list {
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

.progress-summary,
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

.path-entry,
.result-list li {
  display: block;
  line-height: 1.5;
  word-break: break-all;
}

.muted {
  color: #7f8791;
}

@media (max-width: 900px) {
  .topbar,
  .panel-header,
  .range-block summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .topbar-status {
    min-width: 0;
    width: 100%;
  }

  .config-grid,
  .progress-summary,
  .summary-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .topbar,
  .content {
    padding-left: 12px;
    padding-right: 12px;
  }

  .field-control,
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .mode-tabs {
    grid-template-columns: 1fr;
  }

  button,
  .ghost-button {
    width: 100%;
  }

  table {
    min-width: 600px;
  }
}
</style>
