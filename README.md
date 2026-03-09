# Porter

> Windows 高效批量文件复制工具

Porter 是一个面向 Windows 的桌面应用，专注于**按清单批量复制、移动和删除**指定文件夹。底层使用 Windows 原生 `Robocopy` 多线程引擎，提供可视化操作界面和完善的预检机制，适用于大规模数据迁移与备份场景。

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **清单驱动** | 支持 TXT / CSV 清单文件、主配置+子配置嵌套模式、目录即清单三种配置方式 |
| **三种操作** | 复制、移动、删除，一套工作流覆盖常见场景 |
| **预检机制** | 执行前自动扫描、匹配，统计缺失/重复/已存在项，避免盲操作 |
| **高性能复制** | 底层调用 `Robocopy /MT:32` 多线程复制，充分利用 SSD 和多核 CPU |
| **实时进度** | 显示当前文件、完成百分比、速度、剩余时间 |
| **智能目录发现** | 可自动在多层嵌套目录中搜索目标子目录 |
| **冲突策略** | 目标已存在时支持跳过、覆盖合并、先删后复制三种策略 |
| **操作日志** | 每次执行自动生成带时间戳的日志文件 |
| **便携部署** | 打包为 Windows Portable `.exe`，无需安装 |

---

## 适用场景

- 根据目录名清单批量备份/迁移/清理数据
- DasViewer 导出的瓦片选择集处理（向下兼容）
- 按配置文件批量复制指定文件夹到目标位置
- 大规模项目文件的结构化搬运

---

## 快速开始

### 下载使用

1. 从 [Releases](release/) 下载最新的 Portable `.exe`
2. 双击运行，无需安装
3. 配置**主配置文件**（或目录）、**源目录**、**目标目录**
4. 点击**预检** → 确认结果 → 点击**执行**

### 配置模式

Porter 支持三种配置输入方式：

**模式一：直接清单文件**（推荐）
```
# my_list.txt — 一行一个目录名
ProjectA
ProjectB_backup
Data_2024
```

**模式二：主配置 + 子配置文件**
```
# main_config.txt — 列出子配置文件名
SubConfig_001-010.txt
SubConfig_011-020.txt
```
每个子配置文件中包含具体的目录名清单，支持按区间限定搜索范围。

**模式三：配置目录**
选择一个目录，其一级子目录名称自动作为待处理清单。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 31 |
| 前端 | Vue 3 (Composition API) + TypeScript 5 |
| 构建 | Vite (`electron-vite`) |
| 复制引擎 | Windows Robocopy（多线程） |
| 打包 | electron-builder → Portable / NSIS |

---

## 开发指南

### 环境要求

- Node.js 20+
- Windows 10 / 11（Robocopy 为 Windows 内置命令）

### 常用命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建生产包
npm run build

# 打包 Windows 便携版
npm run dist:win:portable

# 打包 Windows 安装版
npm run dist:win:nsis

# 打包全部格式
npm run dist:win
```

---

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 应用入口、窗口管理、IPC 注册
│   ├── logger.ts            # 日志模块
│   ├── types.ts             # 类型定义
│   └── services/
│       ├── configLoader.ts      # 配置文件解析（三种模式）
│       ├── scanner.ts           # 目录扫描与匹配
│       ├── copyService.ts       # 复制/移动/删除执行逻辑
│       ├── robocopyAdapter.ts   # Robocopy 命令封装
│       └── tilecopyEngine.ts    # 流程编排引擎
├── preload/                 # Electron Preload 脚本
│   └── index.ts             # IPC Bridge (contextIsolation)
├── renderer/                # Vue 3 渲染进程
│   ├── App.vue              # 主界面
│   ├── main.ts              # Vue 入口
│   └── global.css           # 全局样式
└── icon/                    # 应用图标
```

---

## 文档

详细文档位于 [`docs/`](docs/) 目录：

- [**技术架构**](docs/architecture.md) — 系统架构与模块设计
- [**技术决策**](docs/design-decisions.md) — 关键设计决策与选型理由
- [**用户指南**](docs/user-guide.md) — 完整操作指南
- [**路线图**](docs/roadmap.md) — 未来规划

---

## License

[MIT](LICENSE)
