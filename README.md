# 🎯 MediaHunter (媒体猎手)

![Version](https://img.shields.io/badge/Version-Front_v8.2.3_|_Back_v1.9.17-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Windows_10%2F11-lightgrey.svg)
![Architecture](https://img.shields.io/badge/Architecture-Local_API-success.svg)

**MediaHunter** 是一个高度优化的“浏览器-本地桌面”联动音视频嗅探与下载系统。它巧妙地将前端浏览器的资源嗅探能力与后端强大的 `yt-dlp` 命令行工具无缝结合，并通过底层的 Windows 原生 Toast API 提供丝滑的下载进度反馈。

> **核心理念：** 拒绝臃肿的 GUI 界面，拒绝浏览器的下载沙盒限制。让极客工具回归“静默、高效、安全、高度可配”的本质。

---
## 📸 效果展示 (Demo)

| 1. 自动发现资源 | 2. 智能解析面板 | 3. 系统原生进度 | 4. 下载静默完成 |
| :---: | :---: | :---: | :---: |
| <img src="image.png" width="225"> | <img src="image-1.png" width="225"> | <img src="image-2.png" width="225"> | <img src="image-3.png" width="225"> |

> 从左至右：网页右下角自动唤起按钮 -> 展开详尽的媒体链接列表 -> Windows 通知中心实时进度条 -> 任务圆满结束提示。

---
## ✨ 核心特性 (Key Features)

### 🛡️ 极致安全与解耦 (Security & Decoupling)
* **无跨域本地网关 (No-CORS API)**：后端网关彻底关闭了跨域（CORS）许可，配合 Tampermonkey 的 `GM_xmlhttpRequest` 特权 API，完美切断了常规恶意网页的端口探测与 CSRF 盲打攻击。
* **配置外置化**：所有的底层下载引擎参数（代理、伪装、并发数、保存路径）全部收纳于独立的 `yt-dlp.conf` 配置文件中，实现代码与配置的完全解耦。

### ⚡ 极限性能 (Extreme Performance)
* **VBS 守护进程启动**：原生提供 `StartServer.vbs` 脚本，以最高隐蔽级别彻底隐藏 PowerShell 黑框，实现真正的无感常驻运行与开机自启。
* **纯 PS 反射原生通知**：摒弃 C# 动态编译，通过纯 PowerShell 内存反射直接操作底层 WinRT 字典，实现通知卡片“秒弹”。
* **OOM 防溢出环形缓冲区**：采用队列（Queue）机制，长达数小时的直播流下载也不会造成后台内存泄漏。

### 🎨 优雅体验 (Elegant UX)
* **无闪烁原生进度条**：调用 Windows 10/11 原生通知中心，实现真正的局部进度条刷新，告别频闪与假死。
* **智能日志回收 (Log Rotation)**：任务报错时自动在 `logs` 独立子目录下生成带 UUID 的诊断日志，并静默清理多余旧文件（仅保留最近 9 份），保持目录绝对整洁。

---

## 🏗️ 系统生态 (System Architecture)

MediaHunter 采用典型的 **Local API** 架构，由以下五大组件构成完美闭环：

1. 🌐 **`MediaHunter-8.2.3.user.js` (前端探针)**
   - 运行在浏览器的 Tampermonkey 环境下，负责网络请求拦截（XHR/Fetch重写）、DOM 扫描与媒体解析。
2. 🚪 **`Server.ps1` (本地安全网关)**
   - 常驻后台的微型 HTTP 服务器 (`127.0.0.1:23333`)，只接受特定的 POST 任务，拒绝所有外界探针。
3. ⚙️ **`Worker.ps1` (下载与 UI 执行器)**
   - 隐藏进程，负责接管 `yt-dlp` 命令，挂载输出流以渲染 Windows Toast 通知卡片。
4. 🚀 **`StartServer.vbs` (静默启动器)**
   - 动态获取目录，以无窗口模式拉起 Server 网关，不阻塞前台。
5. 📝 **`yt-dlp.conf` (引擎配置文件)**
   - 集中管理 `yt-dlp` 的核心运行参数，包括 Cookie 提取、请求头伪装、代理及分片下载策略。

---

## 🚀 安装与部署 (Installation & Deployment)

### 1. 环境准备
- **操作系统**：Windows 10 或 Windows 11 (依赖原生 Toast 机制)
- **依赖核心**：下载最新版的 [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) (`yt-dlp.exe`)。
- **浏览器扩展**：[Tampermonkey](https://www.tampermonkey.net/)

### 2. 本地文件部署
在电脑中新建一个专属文件夹（例如 `D:\MediaHunter\`），将以下文件放入该目录中：
- `Server.ps1`
- `Worker.ps1`
- `StartServer.vbs`
- `yt-dlp.conf`
- `yt-dlp.exe`
- `icon.png` (可选，用于通知栏显示的图标)

### 3. 设置开机自启 (推荐)
为了获得最极致的体验，建议让网关在开机时自动静默运行：
1. 右键点击 `StartServer.vbs` -> **创建快捷方式**。
2. 按下 `Win + R` 键，输入 `shell:startup` 并回车，打开 Windows 启动文件夹。
3. 将刚才创建的快捷方式剪切到该文件夹中即可。
*(现在你可以双击 `StartServer.vbs` 直接启动服务，没有任何黑框打扰！)*

### 4. 浏览器端部署
在 Tampermonkey 中新建脚本，将 `MediaHunter-8.2.3.user.js` 的代码粘贴并保存。打开任意视频网站，右下角出现“媒体猎手”悬浮钮即代表前端就绪。

---

## ⚙️ 配置文件指南 (`yt-dlp.conf`)

本项目强烈推荐通过 `yt-dlp.conf` 来管理下载引擎的行为。

### 🦊 为什么默认推荐使用 Firefox？
由于现代浏览器的安全机制，Chrome / Edge 等 Chromium 系浏览器在运行时会通过操作系统级的 DPAPI 对 Cookie 数据库进行强加密和文件独占锁。这导致 `yt-dlp` 经常无法在浏览器未关闭的情况下成功提取 Cookie。
**Firefox** 的机制更为开放，`yt-dlp` 可以随时流畅地热读取 Firefox 的 Cookie，这也是为什么配置中默认采用 `--cookies-from-browser firefox` 且配合 `--impersonate "firefox"` 来绕过强力反爬校验的原因。

### 🟢 小白用户必看 (基础参数调整)
如果你是普通用户，**请务必使用记事本打开 `yt-dlp.conf` 修改以下三处**：

1. **修改下载路径**：
   找到 `--paths`，将路径修改为你电脑上实际存在的文件夹。
   ```text
   --paths "temp:D:\你的缓存文件夹"
   --paths "home:D:\你的最终下载文件夹"
2. **修改或关闭代理：**
   如果你没有使用科学上网，或者代理端口不是 `10808`，请修改或在前面加 `#` 注释掉它：

   ```text
   #--proxy "socks5://127.0.0.1:10808"
3. **调整 Cookie 来源和user-agent**(如果你不用 Firefox)：
   将 `--cookies-from-browser firefox` 修改为 `--cookies-from-browser chrome` 或 `--cookies-from-browser edge`，同时--user-agent也请调整为对应匹配的chrome或edge的user-agent。

### 🔴 高级极客区 (按需调整)

对于有经验的用户，配置文件中预留了强大的反爬与性能参数：

* `--concurrent-fragments 6`：开启 6 线程并发下载 m3u8 分片，极大提升速度。
* `--impersonate "firefox"`：底层 TLS 指纹伪装，用于突破 Cloudflare 等高防 CDN。
* `--add-header ...`：注入了完整的原生浏览器 `Sec-Fetch-*` 跨域请求头，完美模拟人类真实访问。


>**提示tips:**
--cookies-from-browser、--impersonate、--user-agent、--add-header需互相匹配，'--add-header'参数配置较为复杂，不清楚如何配置时，建议删除或注释**

---

## 🛠️ 排错与日志 (Troubleshooting)

如果在点击下载后，Windows 右下角提示**“下载失败”**：

1. 请前往你存放本项目的目录。
2. 打开自动生成的 `logs/` 文件夹。
3. 里面会包含详细的 `yt-dlp_error_[时间戳]_[UUID].log` 文件，里面记录了完整的底层报错信息（通常是因为网络代理不通、Cookie 失效或路径不存在）。

---
## 📜 声明 (Disclaimer)

本项目仅供网络技术学习、防盗链机制研究及本地系统 API 调用测试使用。请遵守当地法律法规及目标网站的服务条款，严禁使用本工具下载或传播未经授权的版权内容。

---

*Created with ❤️ by yudong2ao & Gemini*