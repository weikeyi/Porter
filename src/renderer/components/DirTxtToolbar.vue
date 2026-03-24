<template>
  <div class="panel dirtxt-toolbar">
    <div class="panel-header toggle-header" @click="isExpanded = !isExpanded">
      <div class="header-left">
        <span class="toggle-icon">{{ isExpanded ? '▼' : '▶' }}</span>
        <h2>目录与 TXT 操作</h2>
      </div>
      <span class="panel-tag" title="可用于快速生成或处理 TXT 配置文件">批量工具</span>
    </div>

    <div v-show="isExpanded" class="toolbar-content">
      <!-- 操作 1：生成 TXT -->
      <div class="action-row">
        <span class="action-title">生成 TXT：</span>
        <button type="button" class="ghost-button" :disabled="isBusy" @click="handleGenerate">
          1. 选择目录并导出为 TXT
        </button>
      </div>

      <!-- 操作 2：追加到 TXT -->
      <div class="action-row">
        <span class="action-title">增加记录：</span>
        <button type="button" class="ghost-button" :disabled="isBusy" @click="handleAppend">
          2. 选择目录并追加至已有 TXT
        </button>
      </div>

      <!-- 操作 3：从 TXT 中删除 -->
      <div class="action-row">
        <span class="action-title">删除匹配：</span>
        <button type="button" class="ghost-button" :disabled="isBusy" @click="handleRemove">
          3. 选择目录并从已有 TXT 中删除
        </button>
      </div>

      <!-- 消息提示区 -->
      <div v-if="resultMessage" :class="['result-message', { error: isError }]">
        {{ resultMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isExpanded = ref(false);
const isBusy = ref(false);
const resultMessage = ref('');
const isError = ref(false);

function showMessage(msg: string, isErr = false) {
  resultMessage.value = msg;
  isError.value = isErr;
}

async function handleGenerate() {
  if (!window.tilecopy) return;
  try {
    isBusy.value = true;
    showMessage('正在选择目录...');
    
    // 1. 选目录
    const dirPath = await window.tilecopy.selectAnyDirectory('选择要读取子文件夹的目录');
    if (!dirPath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在选择保存位置...');
    // 2. 选保存位置
    const savePath = await window.tilecopy.saveAnyTxt('dir_names.txt');
    if (!savePath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在处理...');
    // 3. 执行生成
    const res = await window.tilecopy.dirToTxtGenerate(dirPath, savePath);
    showMessage(res.message, !res.success);
    
  } catch (err: any) {
    showMessage(err.message || '出现异常', true);
  } finally {
    isBusy.value = false;
  }
}

async function handleAppend() {
  if (!window.tilecopy) return;
  try {
    isBusy.value = true;
    showMessage('正在选择目录...');
    
    // 1. 选目录
    const dirPath = await window.tilecopy.selectAnyDirectory('选择要读取子文件夹的目录');
    if (!dirPath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在选择目标 TXT...');
    // 2. 选已有的 TXT
    const txtPath = await window.tilecopy.selectAnyTxt('选择要追加内容的 TXT 文件');
    if (!txtPath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在处理...');
    // 3. 执行追加
    const res = await window.tilecopy.dirToTxtAppend(dirPath, txtPath);
    showMessage(res.message, !res.success);
    
  } catch (err: any) {
    showMessage(err.message || '出现异常', true);
  } finally {
    isBusy.value = false;
  }
}

async function handleRemove() {
  if (!window.tilecopy) return;
  try {
    isBusy.value = true;
    showMessage('正在选择目录...');
    
    // 1. 选目录
    const dirPath = await window.tilecopy.selectAnyDirectory('选择参考目录（包含要删除的文件夹名）');
    if (!dirPath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在选择目标 TXT...');
    // 2. 选已有的 TXT
    const txtPath = await window.tilecopy.selectAnyTxt('选择要执行删除操作的 TXT 文件');
    if (!txtPath) {
      showMessage('操作已取消');
      return;
    }

    showMessage('正在处理...');
    // 3. 执行删除
    const res = await window.tilecopy.dirToTxtRemove(dirPath, txtPath);
    showMessage(res.message, !res.success);
    
  } catch (err: any) {
    showMessage(err.message || '出现异常', true);
  } finally {
    isBusy.value = false;
  }
}
</script>

<style scoped>
.toggle-header {
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
}

.toggle-header:hover h2 {
  color: #fff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-icon {
  font-size: 12px;
  color: var(--muted);
  width: 16px;
  display: inline-block;
}

.panel-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 12px;
  background: transparent;
}

.toolbar-content {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-title {
  width: 80px;
  color: var(--muted);
  font-size: 13px;
  text-align: right;
  flex-shrink: 0;
}

.action-row button {
  flex: 1;
  text-align: left;
  max-width: 400px;
}

.result-message {
  margin-top: 4px;
  padding: 10px;
  background: var(--line);
  border: 1px solid var(--line-strong);
  color: #8fd0a4; /* 成功绿色 */
  font-size: 13px;
}

.result-message.error {
  background: #201314;
  border-color: var(--red-border);
  color: #f0a1a1;
}

@media (max-width: 640px) {
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }
  .action-title {
    text-align: left;
    width: auto;
  }
  .action-row button {
    max-width: none;
  }
}
</style>
