<template>
  <main class="app-shell">
    <TopBar
      :runtimeStatus="runtimeStatus"
      :runtimeTone="runtimeTone"
    />

    <section class="content">
      <ConfigPanel
        :form="form"
        :configInfo="configInfo"
        :configErrors="configErrors"
        :isBusy="isBusy"
        :isCopying="isCopying"
        :isFormValid="isFormValid"
        :canExecuteAction="canExecuteAction"
        :isPreflightStale="isPreflightStale"
        :actionLabel="actionLabel"
        :operationLabel="operationLabel"
        :actionClass="actionClass"
        @preflight="handlePreflight"
        @execute="handleCopy"
        @reset="handleReset"
        @choose-main-config="chooseMainConfig"
        @choose-main-config-directory="chooseMainConfigDirectory"
        @choose-source-root="chooseSourceRoot"
        @choose-target-root="chooseTargetRoot"
      />

      <ProgressPanel
        :copyProgress="copyProgress"
        :operationLabel="operationLabel"
        :isCopying="isCopying"
      />

      <PreflightPanel
        :preflightReports="preflightReports"
        :operationLabel="operationLabel"
      />

      <ResultPanel
        :copyOutcomes="copyOutcomes"
        :operationLabel="operationLabel"
        :operation="form.operation"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type {
  TileCopyJobRequest,
  PreflightReport,
  CopyOutcome,
  CopyProgress,
} from "#main/types";
import { formatError } from "./composables/useFormatters";
import TopBar from "./components/TopBar.vue";
import ConfigPanel from "./components/ConfigPanel.vue";
import ProgressPanel from "./components/ProgressPanel.vue";
import PreflightPanel from "./components/PreflightPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";

// ── 表单状态 ──
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

// ── 运行时状态 ──
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

// ── 配置持久化 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  if (!window.tilecopy) return;
  try {
    const saved = await window.tilecopy.getSavedConfig();
    if (saved) {
      // 仅恢复有值的字段
      if (typeof saved.mainConfigPath === 'string') form.mainConfigPath = saved.mainConfigPath;
      if (typeof saved.sourceRoot === 'string') form.sourceRoot = saved.sourceRoot;
      if (typeof saved.targetRoot === 'string') form.targetRoot = saved.targetRoot;
      if (saved.operation === 'copy' || saved.operation === 'move' || saved.operation === 'delete') {
        form.operation = saved.operation;
      }
      if (saved.conflictStrategy === 'skip' || saved.conflictStrategy === 'overwrite' || saved.conflictStrategy === 'purge') {
        form.conflictStrategy = saved.conflictStrategy;
      }
      if (typeof saved.ignoreCase === 'boolean') form.ignoreCase = saved.ignoreCase;
      if (typeof saved.measureSize === 'boolean') form.measureSize = saved.measureSize;
      if (typeof saved.discoverRangeSubRoot === 'boolean') form.discoverRangeSubRoot = saved.discoverRangeSubRoot;
      if (typeof saved.discoveryMaxDepth === 'number') form.discoveryMaxDepth = saved.discoveryMaxDepth;
    }
  } catch (err) {
    console.warn('[App] 读取保存的配置失败', err);
  }
});

// 监听 form 变化，防抖保存
watch(
  () => ({ ...form }),
  (newForm) => {
    if (!window.tilecopy) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      window.tilecopy!.saveConfig(newForm);
    }, 500);
  },
  { deep: true }
);

// ── 计算属性 ──
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

// ── 文件选择 ──
async function chooseMainConfig() {
  if (!window.tilecopy) return;
  const selected = await window.tilecopy.selectMainConfig();
  if (selected) form.mainConfigPath = selected;
}

async function chooseMainConfigDirectory() {
  if (!window.tilecopy) return;
  const selected = await window.tilecopy.selectMainConfigDirectory();
  if (selected) form.mainConfigPath = selected;
}

async function chooseSourceRoot() {
  if (!window.tilecopy) return;
  const selected = await window.tilecopy.selectSourceRoot();
  if (selected) form.sourceRoot = selected;
}

async function chooseTargetRoot() {
  if (!window.tilecopy || form.operation === "delete") return;
  const selected = await window.tilecopy.selectTargetRoot();
  if (selected) form.targetRoot = selected;
}

// ── 核心操作 ──
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
  if (!window.tilecopy || preflightReports.value.length === 0) return;

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
  if (isBusy.value || isCopying.value) return;

  const confirmed = window.confirm(
    "确认要重置所有配置和结果吗？当前预检和复制结果将被清空。"
  );
  if (!confirmed) return;

  form.mainConfigPath = "";
  form.sourceRoot = "";
  form.targetRoot = "";
  form.ignoreCase = true;
  form.conflictStrategy = "skip";
  form.measureSize = false;
  form.discoverRangeSubRoot = true;
  form.discoveryMaxDepth = 4;
  form.operation = "copy";

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

// ── 启动 ping ──
void (async () => {
  if (!window.tilecopy) return;
  const pong = await window.tilecopy.ping();
  runtimeStatus.value = `服务就绪 (${pong})`;
})();
</script>

<style scoped>
/* ── 壳级别样式 + 共享基础变量 ── */
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

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px 20px;
}

/* ── 共享的面板和基础控件样式（子组件继承） ── */
:deep(.panel) {
  border: 1px solid var(--line);
  background: var(--panel);
  padding: 14px;
}

:deep(.panel-header) {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

:deep(.panel-header h2) {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

:deep(.panel-subtext) {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

:deep(input),
:deep(select) {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  background: var(--panel-muted);
  color: var(--text);
  font: inherit;
}

:deep(input::placeholder) {
  color: #6f7882;
}

:deep(input:focus),
:deep(select:focus) {
  outline: none;
  border-color: #59636f;
}

:deep(input:disabled),
:deep(select:disabled),
:deep(button:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}

:deep(button) {
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid var(--blue-border);
  background: var(--blue);
  color: #f8fafc;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

:deep(button:hover) {
  background: #1e40af;
}

:deep(button.warn) {
  border-color: var(--orange-border);
  background: #b45309;
}

:deep(button.warn:hover) {
  background: #92400e;
}

:deep(button.danger) {
  border-color: var(--red-border);
  background: #b91c1c;
}

:deep(button.danger:hover) {
  background: #991b1b;
}

:deep(.ghost-button) {
  border-color: var(--line-strong);
  background: var(--panel-muted);
  color: var(--text);
}

:deep(.ghost-button:hover) {
  background: #1a1f25;
}

@media (max-width: 640px) {
  .content {
    padding-left: 12px;
    padding-right: 12px;
  }

  :deep(button),
  :deep(.ghost-button) {
    width: 100%;
  }
}
</style>
