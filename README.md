# SSH Client

基于 Electron + Vue 的跨平台 SSH 客户端，支持从 `~/.ssh/config` 读取主机配置，提供文件浏览、文件预览和终端功能。

## 功能特性

- **主机管理**：自动解析 `~/.ssh/config`，支持 ProxyJump 多跳连接
- **文件浏览**：SFTP 文件树，支持目录展开与导航
- **文件预览**：在线预览远程文件，支持代码高亮（5MB 以内）
- **终端**：集成 xterm.js 伪终端，支持 Web 链接点击

## 下载

前往 [Releases](https://github.com/guoxiao0521/smart-ssh-client/releases) 下载 Windows 安装包（.exe）。

## 推荐 IDE

[VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
