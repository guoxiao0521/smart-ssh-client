# Electron → Tauri 迁移开发计划

> 本文档是 Smart SSH Client 从 Electron 迁移到 Tauri 的完整开发计划。
> 迁移目标：功能 1:1 对等，渲染层组件零改动或最小改动。

## 1. 迁移动机与目标

### 动机

- **包体积**：Electron 打包自带 Chromium + Node.js 运行时（安装包约 80~100MB）；Tauri 复用系统 WebView（Windows 上为 WebView2），安装包可缩到 5~15MB。
- **内存占用**：省掉独立 Chromium 实例与 Node 主进程，常驻内存显著降低，对"挂着多个 SSH 会话长时间运行"的使用场景收益明显。
- **启动速度**：Tauri 冷启动更快。
- **后端语言**：主进程逻辑迁到 Rust，SSH/SFTP 这类 IO 密集 + 并发场景用 tokio 异步模型表达更自然，且没有 Node 单线程事件循环的吞吐顾虑。

### 目标

1. 迁移完成后，TASK.md 中「已完成功能」清单逐项对等，不丢功能。
2. 渲染层（Vue 组件、useSSH、types.ts）**零改动或最小改动**：只替换 `window.ssh` 的底层实现，不动接口签名。
3. 迁移期间**冻结新功能开发**（文件编辑保存、keepalive 等顺延到迁移完成后）。
4. 保留 Electron 版本可运行，直到 Tauri 版本通过全量验收后再删除。

## 2. 现状盘点

### 保留（与 Electron 无关，直接复用）

| 模块 | 说明 |
| --- | --- |
| `src/renderer/src/components/*` | Vue 3 组件（ConnectionList、FileTree、FilePreview、TerminalPanel、TreeNodeItem） |
| `src/renderer/src/composables/useSSH.ts` | 全局 SSH 状态，只依赖 `window.ssh` 接口 |
| `src/renderer/src/types.ts` | 渲染层共享类型 |
| `src/renderer/src/assets/main.css` | GitHub Dark 主题 CSS 变量 |
| xterm / highlight.js / lucide-vue-next | 纯前端库，与宿主无关 |

### 重写（Node/Electron 依赖，需迁到 Rust）

| 模块 | 依赖的 Electron/Node 能力 | 迁移去向 |
| --- | --- | --- |
| `src/main/ssh/connection-manager.ts`（~730 行，**迁移核心难点**） | ssh2（连接/认证/ProxyJump/SFTP/PTY）、fs、os、`WebContents.send` | Rust `russh` + `russh-sftp` |
| `src/main/ssh/config-parser.ts` | `ssh-config` 库解析 `~/.ssh/config` | Rust 解析（见选型） |
| `src/main/ssh/config-manager.ts` | `ssh-config` 库回写 `~/.ssh/config`（增删改主机，保留原格式） | Rust 自研格式保留编辑器 |
| `src/main/ssh/credential-store.ts` | Electron `safeStorage` + userData 目录 | Rust `keyring` crate |
| `src/main/ssh/ipc-handlers.ts` | ipcMain 17 个通道；内嵌 `dialog.showOpenDialog / showSaveDialog` | Tauri command + `tauri-plugin-dialog` |
| `src/main/index.ts` | BrowserWindow、`shell.openExternal`、app 生命周期 | `tauri.conf.json` 窗口配置 + `tauri-plugin-opener` |
| `src/preload/index.ts` | contextBridge / ipcRenderer | 渲染层 adapter（TS，调 Tauri invoke/Channel） |

### 删除（模板残留 / 不再需要）

- `src/renderer/src/components/Versions.vue`（读 Electron 版本信息的模板残留）
- `@electron-toolkit/*` 全家桶、`electron`、`electron-builder`、`electron-vite`
- `ipcMain.on('ping')` 测试代码
- 双 tsconfig（`tsconfig.node.json` / `tsconfig.web.json`）合并为单一前端 tsconfig（Rust 侧由 Cargo 管）

## 3. 技术选型与映射表

### 能力映射

| Electron / Node 侧 | Tauri / Rust 侧（推荐） | 备注 |
| --- | --- | --- |
| ssh2 连接、认证、shell/PTY | **`russh`** | 纯 Rust、tokio 异步；支持 publickey/password/agent 认证；`channel_open_direct_tcpip` 实现 ProxyJump 链式隧道 |
| ssh2 SFTP | **`russh-sftp`** | 跑在 russh channel 之上，覆盖 readdir/stat/read/write/rename/unlink |
| `ssh-config` 解析 | **`ssh2-config`** crate（或自研解析器） | 只读解析可用现成 crate；需验证 `Host`/`HostName`/`Port`/`User`/`IdentityFile`/`BindAddress`/`ProxyJump` 的 compute 语义与现版一致 |
| `ssh-config` 回写（增删改主机） | **自研格式保留编辑器**（重点风险，见 §6） | 现有 JS 库能保留注释/缩进/无关 Host 块；Rust 生态没有等价物，需按行编辑：只改目标 Host 块，其余行原样保留 |
| `safeStorage` 加密密码 | **`keyring`** crate | 直接对接 Windows 凭据管理器 / macOS Keychain / Linux libsecret，比 safeStorage（加密后仍落自管 JSON）更标准 |
| `dialog.showOpenDialog / showSaveDialog` | **`tauri-plugin-dialog`** | 支持多选打开、保存对话框 defaultPath |
| `ipcMain.handle` / `ipcRenderer.invoke` | **`#[tauri::command]`** + `invoke()` | 请求-响应模型一一对应 |
| `webContents.send('ssh:terminal-data')` | **Tauri Channel API** | 高频 PTY 数据流优先用 Channel（点对点、有序、低开销），不用全局 event |
| `shell.openExternal`（外链） | **`tauri-plugin-opener`** | xterm web-links addon 点击外链时调用 |
| ssh-agent（`SSH_AUTH_SOCK` / Windows 命名管道） | russh 的 agent client（Unix socket）；Windows `\\.\pipe\openssh-ssh-agent` 需验证 | Phase 0 spike 必验项，见 §6 |
| electron-vite | **Tauri CLI + 原生 Vite** | 前端就是普通 Vite + Vue 项目 |
| electron-builder | **`tauri build`** | Windows 产 NSIS/MSI |

### 被否决的备选方案

- **`ssh2` crate（libssh2 绑定）**：阻塞式 API，多连接并发需要自管线程池；libssh2 是 C 依赖，Windows 交叉编译麻烦。russh 纯 Rust + 异步更契合。
- **Node sidecar 方案**（Tauri 拉起一个 Node 进程继续跑 ssh2）：改动最小，但失去 Tauri 的体积/内存优势（还得带 Node 运行时），且多一层进程通信。**仅作为 Phase 0 spike 失败时的兜底**。

## 4. 接口契约策略

`window.ssh` API（现由 preload 注入，17 个方法 + `pty` 子对象 + terminal-data 事件订阅）是渲染层与后端的唯一契约。迁移策略：**签名一个都不改，只换实现**。

- 新增 `src/renderer/src/ssh-api.ts`：用 `@tauri-apps/api` 的 `invoke` / `Channel` 实现与 preload 完全相同的接口，启动时挂到 `window.ssh`（或改为模块导入，`useSSH.ts` 一行 import 切换）。
- Tauri command 命名与现有 IPC 通道一一对应：`ssh:get-config` → `ssh_get_config`，依此类推，共 17 个。
- `pty.onData / offData` 事件订阅语义用 Channel 封装在 adapter 内部，组件无感知。
- 错误码枚举（`AUTH_REQUIRED` / `AUTH_FAILED` / `NETWORK_ERROR` / `HOST_KEY_ERROR` / `UNKNOWN`）在 Rust 侧定义 serde 序列化的 enum，序列化结果与现有字符串字面量完全一致；`ConnectResult` 的 `{ ok, connectionId | error, usedSavedPassword }` 结构原样保留。
- `readFile` 返回的 `FileContent`（text/base64/mimeType/size/error）、5MB 大小限制、文本/图片 MIME 映射表逐项照搬。

## 5. 分阶段实施计划

### Phase 0：技术验证 spike（Go / No-Go 决策点）

**任务**：在独立目录写一个最小 Rust demo（不进主仓库），用 russh 在 Windows 上打通：

- [x] TCP 直连 + 密钥认证（含默认密钥发现顺序 id_ed25519 → id_ecdsa → id_rsa → id_dsa）
- [x] ssh-agent 认证（Windows OpenSSH agent 命名管道 `\\.\pipe\openssh-ssh-agent`）— API 已验证；本机服务 Disabled 未做端到端，见下方决策
- [x] 密码认证 + 认证失败错误可区分（对齐现有错误分类）
- [x] ProxyJump 一跳：跳板连接 → `direct-tcpip` → 目标连接
- [x] russh-sftp readdir + 读文件
- [x] shell channel 流式输出 + 窗口 resize
- [x] 加密私钥（带 passphrase）的行为确认

**Spike 位置**：`d:\repo\russh-phase0-spike`（本地 jump/target，不依赖外部主机）。运行：`cargo run --release`。

**决策：CONDITIONAL GO**（2026-07-16）

- 6 PASS / 0 FAIL / 1 SKIP（agent：服务 Disabled，非管理员无法启动；`AgentClient::connect_named_pipe` 已接入）。
- ProxyJump / SFTP / PTY / 密钥与密码均打通 → **不走 Node sidecar 兜底**，进入 Phase 1。
- 管理员启动 `ssh-agent` 后重跑可将 SKIP 升为 PASS；产品侧 Windows 上 agent 不可用时降级密钥/密码即可。
- 加密钥：无 passphrase → `The key is encrypted` → 可归 `AUTH_REQUIRED`；有 passphrase → 认证成功。
- SFTP：同进程 harness 里勿在 `Handler::subsystem_request` 内 `await` `russh_sftp::server::run`（会卡死 session 循环 → INIT/VERSION Timeout）；应 `channel_success` 后 `tokio::spawn`。详见 spike `README.md`。

**验收**：以上全部打通 → Go；agent 或 ProxyJump 打不通且无 workaround → 评估 Node sidecar 兜底或暂停迁移。

### Phase 1：工程脚手架

**任务**：

- [ ] 新建 `src-tauri/`（`cargo tauri init`），窗口配置对齐现状（1200×800、隐藏菜单栏、外链拦截）
- [ ] 前端从 electron-vite 三段式布局迁出：`src/renderer/` 内容变为标准 Vite + Vue 根项目结构
- [ ] 合并 tsconfig，调整 ESLint/Prettier 配置路径
- [ ] 新增 `ssh-api.ts` adapter，所有方法先返回 mock/todo
- [ ] 更新 npm scripts：`dev` → `tauri dev`，`build:win` → `tauri build`
- [ ] 删除 Versions.vue 模板残留

**验收**：`npm run dev` 启动 Tauri 窗口，渲染层 UI 完整显示（主机列表为空态即可），`typecheck` / `lint` 通过。

### Phase 2：连接核心（Rust）

**任务**：

- [ ] `~/.ssh/config` 解析（compute 语义对齐：Host 通配、HostName 回退 alias、默认端口 22、User 回退当前用户）
- [ ] 认证回退链：指定 IdentityFile（含 `~`、`%VAR%`/`$VAR` 展开、引号剥离）→ 默认密钥 → agent → 密码；密码提供时只试密码
- [ ] ProxyJump 多跳：递归解析（别名引用完整 Host 配置、`user@host:port` 字面量、`[ipv6]:port`）、循环检测、direct-tcpip 链式隧道、失败时逆序清理
- [ ] 错误分类器：网络类（refused/timeout/dns）、认证类、host key 类 → 对齐现有错误码
- [ ] 多连接表：`Mutex<HashMap<ConnectionId, Connection>>`（或 DashMap），connect/disconnect command；断开时级联关闭该连接的 PTY 与跳板链
- [ ] `ssh_get_config` / `ssh_connect` / `ssh_disconnect` command 接通 adapter

**验收**：应用内可列出主机、直连和 ProxyJump 多跳均可建立/断开，多连接标签并存，错误弹窗文案与错误码与 Electron 版一致。

### Phase 3：文件能力（SFTP + 对话框）

**任务**：

- [ ] `listDir`：readdir + 目录判定（mode 位）+ size/mtime
- [ ] `readFile`：stat 先行、5MB 限制、文本/图片/二进制三分支（MIME 映射表照搬）
- [ ] `uploadFile`：`tauri-plugin-dialog` 多选 → 写远端临时文件 → `posix-rename@openssh.com` 原子替换，扩展不支持时回退标准 rename，失败清理临时文件
- [ ] `downloadFile`：保存对话框（defaultPath 取 basename）→ 本地临时文件 → 原子替换
- [ ] `deleteFile`：unlink

**验收**：文件树浏览/路径跳转、文本/图片/二进制/大文件预览、上传下载删除全流程与 Electron 版行为一致（含取消对话框的返回值语义）。

### Phase 4：终端（PTY + Channel 流）

**任务**：

- [ ] `ssh_pty_create`：shell channel（term=xterm-256color, cols/rows），返回 ptyId；stdout/stderr 统一经 Channel 推送 `{ id, data }`
- [ ] `ssh_pty_input` / `ssh_pty_resize` / `ssh_pty_close`（fire-and-forget，对应现有 `ipcRenderer.send` 语义）
- [ ] 会话关闭时推送 `[Session closed]` 提示
- [ ] adapter 内封装 onData/offData 订阅管理
- [ ] 压测：`cat` 大文件 / `yes` 命令验证 Channel 吞吐与 xterm 渲染不卡顿

**验收**：终端交互、中文/彩色输出、resize 自适应、web 链接点击外开、断开连接后终端正确关闭。

### Phase 5：配置回写与凭证

**任务**：

- [ ] `~/.ssh/config` 增删改：按行编辑实现格式保留（只增删改目标 Host 块，注释/空行/无关块原样不动）；写前备份（如 `config.bak`）
- [ ] `keyring` 凭证存储：save/get/delete/has/list 五个 command；`list` 需要自管一份别名索引（keyring 无枚举能力）
- [ ] 旧数据迁移决策：`credentials.json` 是 safeStorage（DPAPI）加密，Rust 侧无法解密 → **放弃迁移，首次启动提示用户重新保存密码**，文档与 UI 提示写清楚
- [ ] 连接时自动使用已存密码 + `usedSavedPassword` 回传语义对齐

**验收**：应用内增删改主机后，手工 diff `~/.ssh/config` 确认无关内容零改动；密码保存/自动登录/删除全流程可用。

### Phase 6：收尾（打包、验收、删除 Electron）

**任务**：

- [ ] `tauri build` 产出 Windows 安装包，图标/应用名/版本号产品化
- [ ] 双开并行验收：Electron 版 vs Tauri 版，逐项对照 TASK.md「已完成功能」清单打勾
- [ ] 删除 `src/main/`、`src/preload/`、Electron 相关依赖与配置
- [ ] 更新 CLAUDE.md（架构章节、命令）与 TASK.md
- [ ] 对比记录包体积/内存/启动时间数据，验证迁移收益

**验收**：干净 clone 后 `npm install && npm run dev` 可用；安装包在无开发环境的 Windows 机器上可安装运行（注意 WebView2 运行时依赖）。

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| russh 对 Windows OpenSSH agent 命名管道支持不完善 | agent 认证不可用 | Phase 0 必验；不行则自己实现 agent 协议 client（协议简单）或引入专门 crate；最差降级为"Windows 上不支持 agent，走密钥/密码" |
| 加密私钥（passphrase）处理 | 现版 ssh2 遇加密钥直接归为认证失败走密码回退；russh 解钥 API 不同 | Phase 0 确认行为，至少对齐现状（不支持 passphrase 但不崩溃）；后续可作为新功能补 passphrase 输入框 |
| `~/.ssh/config` 回写破坏用户文件格式 | 用户手工维护的 config 被改乱，**信任性事故** | 自研按行编辑器 + 写前备份 + 单测覆盖（注释/Include/通配 Host/多空行等用例）；Phase 5 验收强制人工 diff |
| PTY 高频数据经 IPC 吞吐不足 | 终端卡顿 | 用 Channel 而非 event；必要时 Rust 侧做微批量合并（如 5ms 聚合）再推送 |
| `posix-rename@openssh.com` 扩展在 russh-sftp 不可用 | 上传原子替换降级 | 确认 russh-sftp 的 extended request 支持；不支持则实现"rename 失败 → unlink 目标 → 重试 rename"的次优路径（与现版回退语义对齐） |
| WebView2 与 Chromium 渲染差异 | xterm/CSS 表现不一致 | WebView2 本身基于 Chromium，风险低；Phase 1 起就在 WebView2 里跑全量 UI，尽早暴露 |
| safeStorage 旧密码无法解密迁移 | 用户需重新录入密码 | 产品上接受，首次启动明确提示；不做跨加密体系迁移 |
| russh 学习曲线 / API 与 ssh2 心智模型差异 | 工期不确定 | Phase 0 spike 前置消化最难的 20%（agent、多跳、PTY 流） |

## 7. 不迁移 / 顺延项

以下 TASK.md 中的待办**不在本次迁移范围**，迁移完成后在 Tauri 版上继续推进：

- 远程文本文件编辑与保存（P0）
- 文件读写统一错误提示（P0）
- 新建目录 / 重命名 / 文件树搜索 / 收藏路径（P1）
- keepalive 与断线自动重连（P1）
- 终端多标签页、终端个性化配置（P1/P2）
- 端口转发、SSH 密钥管理、会话日志（P2）

迁移期间主分支冻结新功能，仅接受 bug 修复；建议在 `tauri-migration` 分支上进行 Phase 1~6。

---

## 附：迁移前后架构对比

```
Electron（现状）                          Tauri（目标）
─────────────────────                    ─────────────────────
Renderer (Vue)                           Renderer (Vue, 原样保留)
  └─ window.ssh ← preload contextBridge    └─ window.ssh ← ssh-api.ts adapter
       │ ipcRenderer.invoke/send                │ @tauri-apps/api invoke / Channel
Main Process (Node)                      Core Process (Rust)
  ├─ ssh2 (连接/SFTP/PTY)                  ├─ russh + russh-sftp
  ├─ ssh-config (解析/回写)                 ├─ ssh2-config + 自研格式保留回写
  ├─ safeStorage 凭证                      ├─ keyring (系统凭据库)
  └─ dialog / shell                       └─ tauri-plugin-dialog / opener
```
