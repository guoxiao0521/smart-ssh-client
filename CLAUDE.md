# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # 开发模式（热重载）
npm run build        # TypeScript 检查 + electron-vite 构建
npm run typecheck    # 类型检查（Node + Web 两套 tsconfig）
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run build:win    # Windows 打包
```

## Architecture

三层 Electron 架构，进程间严格隔离：

**Main Process** (`src/main/`)
- `ssh/config-parser.ts` — 解析 `~/.ssh/config`，使用 `ssh-config` 库的 `LineType.DIRECTIVE` 和 `parsed.compute(alias)`
- `ssh/connection-manager.ts` — 核心 SSH 业务：密钥发现、ProxyJump 多跳、SFTP、PTY（伪终端）管理；文件读取有 5MB 大小限制
- `ssh/ipc-handlers.ts` — IPC 路由，用 `event.sender` 传 webContents 引用
- `index.ts` — 窗口创建，调用 `registerIpcHandlers()`

**Preload** (`src/preload/`)
- `index.ts` — 通过 `contextBridge` 暴露 `window.ssh` API（connect/disconnect/listDir/readFile/pty.*）
- `index.d.ts` — TypeScript 类型声明，由 `tsconfig.web.json` 引用

**Renderer** (`src/renderer/src/`)
- `App.vue` — 主布局：可折叠侧边栏 + 右侧可拖动分割面板（文件预览/终端）
- `components/` — ConnectionList、FileTree、FilePreview、TerminalPanel、TreeNodeItem
- `composables/useSSH.ts` — 全局 SSH 状态（hosts、activeConnection、previewFile）
- `types.ts` — 渲染层共享类型（TreeNode、SshHostConfig、FileEntry、FileContent）

## Critical Rules

- 渲染层组件**禁止**从 `../../../../preload/index.d` 导入类型，必须用 `../types`（或相对路径到 `src/renderer/src/types.ts`）
- TypeScript 有两套独立配置：`tsconfig.node.json`（主进程+Preload）和 `tsconfig.web.json`（渲染层）
- 代码风格：单引号、无分号、100 字符行宽（Prettier 配置）
- ESLint 要求：Vue 组件名必须多词（multi-word）

## Tech Stack

- **构建**：electron-vite（Vite + Electron 39）
- **UI**：Vue 3 Composition API + TypeScript
- **SSH**：ssh2（连接/SFTP/PTY）、ssh-config（配置解析）
- **终端**：@xterm/xterm + addon-fit + addon-web-links
- **代码高亮**：highlight.js
- **主题**：GitHub Dark 风格深色主题，CSS 变量定义在 `src/renderer/src/assets/main.css`
