# 代码改进清单

> 面向代码质量、工程实践和用户体验的改进项。
> 与 [roadmap.md](./roadmap.md) 中的功能规划互补，本文侧重**内部治理**。

---

## 🔴 高优先级

### [已完成] 拆分 `App.vue` 单文件组件

当前 `App.vue` 共 1417 行，模板、脚本、样式全部集中在一个文件内。

建议拆分为：

| 组件 | 职责 | 预估行数 |
|------|------|----------|
| `TopBar.vue` | 标题 + 运行状态显示 | ~50 |
| `ConfigPanel.vue` | 路径选择、操作类型、选项、预检/执行按钮 | ~300 |
| `ProgressPanel.vue` | 进度条、速度、剩余时间 | ~80 |
| `PreflightPanel.vue` | 预检扫描结果表格 | ~120 |
| `ResultPanel.vue` | 执行结果表格 | ~120 |

### [已完成] 配置持久化

项目已依赖 `electron-store`，但未实际使用。建议：

- 启动时读取上次的 `mainConfigPath`、`sourceRoot`、`targetRoot` 等字段
- 表单变化时自动保存
- 用户无需每次启动都重新填写路径

### [已完成] 代码风格统一

- 添加 ESLint + Prettier 配置
- 统一换行符（当前 `robocopyAdapter.ts` 使用 `CRLF`，其余文件 `LF`）

---

## 🟡 中优先级

### 错误处理增强

- `copyService.ts` 中复制失败只保留 `reason: string`，丢失了原始错误栈
- `robocopyAdapter.ts` 使用 `stdio: 'ignore'`，Robocopy 失败时无法查看具体输出
- 建议捕获 stderr 用于错误诊断

### 消除重复代码

`copyService.ts` 中 `copyRange()` 和 `deleteRange()` 各定义了一个近似相同的 `emitProgress` 内部函数（~35行），应提取为共享的工具函数。

### 操作可取消

长时间复制/移动操作无取消机制。建议通过 `AbortController` 支持用户中途取消。

### 并发安全

`TileCopyEngine` 使用类实例可变字段（`lastConfig`、`lastPreflight`）缓存状态，无并发保护。快速连续操作可能导致竞态。可加简单锁或队列。

---

## 🟢 低优先级

### UI 增强

- **日志面板**：在 UI 中添加可折叠的运行日志区域，方便普通用户排查问题
- **拖拽支持**：支持拖拽文件/文件夹到输入框自动填充路径

### 测试覆盖

项目当前无任何单元测试。以下模块最适合优先覆盖：

- `configLoader.ts`：表头检测、区间标签提取逻辑
- `scanner.ts`：目录匹配和扫描逻辑

### 国际化 (i18n)

如需面向非中文用户，可引入 `vue-i18n`。仅面向中文用户则无需处理。

---

## 📝 零碎修复

- [x] placeholder 路径补全盘符冒号（`D\\ → D:\\`）
- [x] `electron-log` 从 `devDependencies` 移至 `dependencies`（运行时通过 `logger.ts` 使用）
- [x] 配置持久化已实现，保留 `electron-store` 依赖
- [x] 移除 `app.commandLine.appendSwitch('enable-features', 'ElectronSerialChooser')`（疑似模板残留，与项目无关）
