<template>
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
</template>

<script setup lang="ts">
defineProps<{
  runtimeStatus: string | undefined
  runtimeTone: string
}>()
</script>

<style scoped>
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

.section-label {
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

@media (max-width: 900px) {
  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .topbar-status {
    min-width: 0;
    width: 100%;
  }
}
</style>
