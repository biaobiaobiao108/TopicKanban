# 项目 Agent 协作规则与开发指南 (AGENTS.md)

## 📌 一、铁律规则 (Ironclad Rules)

1. **代码修改后自动提交 Git**：
   * 每次完成代码修改、写完一个新功能或 Bug 修复，并通过全量测试（`pnpm test:run`）与生产构建测试（`pnpm build`）后，必须立即自动执行一次规范清晰的本地 `git commit`。严格执行原子提交。
2. **包管理器优先**：
   * 必须优先使用 `pnpm` 进行依赖安装与脚本执行，`npm` 仅作极端情况兜底。
3. **安全操作**：
   * 运行任何破坏性命令（包括但不限于删除关键文件、重置数据库结构、强制清空存储等）前，必须向用户明确说明风险并获得确认。删除文件优先使用安全机制（`trash` > `rm`）。
4. **最小改动原则**：
   * 修改已有文件时只改动和当前任务直接相关的部分，不擅自进行大范围重构、改写无关组件风格或清理无关逻辑。

---

## 🎬 二、产品定位与核心领域模型 (Domain Model)

本项目为**面向 Bilibili 叙事类视频（互联网人物、网红主播、荒诞事件、社会纪实）创作者专属的「选题生产工作台」**，并非通用看板。

### 1. 核心生命周期（4 个活跃阶段 + 2 个归档状态）
* `inbox`（收集箱）：刚发现的线索或灵感碎片
* `approved`（已立项）：故事线与核心反差确立，准备开工
* `scripting`（写稿中）：正在撰写解说分段文案
* `production`（待制作）：文案定稿，进入录音与剪辑制作
* `published`（已发布）：成片已上线，沉淀播放与互动数据
* `icebox`（搁置）：暂缓或制作条件不成熟

### 2. 核心设计准则
* **下一步行动（Next Action）**：每个选题必须明确当前最该做的一件具体行动，避免多任务停滞。
* **5 维故事评估模型**：人物张力、戏剧冲突、荒诞反差、素材完整度、主线成立度。
* **资料 3 级分层与智能识别**：
  * 严格区分「事实（Fact）」、「线索（Clue）」、「素材（Material）」，并标明可靠度（已核实/待考证/存疑），支持线索一键升级事实与状态无弹窗轮转；
  * 内置 **Bilibili / YouTube 智能识别**：支持粘贴视频分享链接（含 `b23.tv` 短链）自动拉取真实视频标题、UP主/原作者、视频简介与发布日期。
* **时间线与叙事节奏走廊（Timeline & Rhythm Corridor）**：
  * 支持精确（年/月/日）与模糊时间精度（年/月、年份、未知）；
  * 支持自由反差打标（`contrast_tag`）并在顶部以水平流动连线呈现「叙事反差与情绪节奏走廊」。
* **人物档案网（People Archive）**：独立的人物库、别名外号、平台主页及人物网状关系。
* **文案编辑与演播气口（Scripting & Voiceover Cues）**：
  * 编辑器内置语速换算（默认 280 字/分钟），实时换算视频预估时长；
  * 支持演播气口标记（`[停顿 1s]`、`[重音]`、`[反讽语气]` 等），编辑器内部采用原子胶囊徽章（`VoiceoverCueNode`）渲染，并在「偏好与数据」页面支持自定义增删与 KV 持久化；
  * 录音提词器具备高对比度独立深浅色模式，自动将气口渲染为醒目导播胶囊。

---

## 🛠️ 三、技术栈与多环境架构规范 (Tech Stack & Architecture)

### 1. 核心技术栈
* **前端核心**：React 18 + TypeScript + Vite 6 + TailwindCSS 3
* **路由与数据流**：React Router 7 + TanStack Query 5
* **看板与拖拽**：`@dnd-kit/core` + `@dnd-kit/sortable`
* **文案编辑**：`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-character-count` + 自定义原子内联扩展
* **图标系统**：`lucide-react`
* **服务端**：Hono 4 REST API（通用核心工厂位于 `src/server/createApp.ts`）
* **鉴权体系**：Web Crypto HMAC-SHA256 签名无状态 Token（TTL 7 天）

### 2. 双运行环境与存储适配规范 (Storage & Runtime Strategy)

本项目支持 **本地 Podman / Docker 一体化容器**（主力部署）与 **Cloudflare 边缘网络**（无代码托管）双环境无缝切换：

| 运行时环境 | 服务端入口 | 主关系数据库 (`DB`) | 键值与临时存储 (`KV`) | 静态文件托管 |
| :--- | :--- | :--- | :--- | :--- |
| **本地容器 / Node.js** (主力) | `src/server/server.ts` (`@hono/node-server`) | 本地 SQLite (`better-sqlite3` + WAL 模式，文件 `./data/kanban.db`) | 本地 SQLite `_kv_store` 表 (`LocalKVNamespace`) | Node.js 独立托管 SPA `dist/` |
| **Cloudflare Pages** (云端) | `functions/api/[[route]].ts` (Pages Functions) | Cloudflare D1 (SQLite) | Cloudflare Workers KV | Cloudflare Pages CDN |

#### 存储分工原则：
* **主业务持久库 (`DB` / SQLite)**：负责强关系型业务资产（`topics`, `sources`, `timeline_events`, `people`, `drafts`, `draft_citations`, `tags`, `published_videos`）。
* **键值存储 (`KV` / `_kv_store`)**：负责非关系型全局配置与轻量边缘交互数据：
  1. **全局偏好设置** (`app_settings`：语速、主题、排版、演播气口库 `voiceover_cues`、反代公网域名 `public_base_url` 等)；
  2. **免登录外部审稿只读快照** (`share:*` / `topic_share:*`：支持设定 TTL 自动物理销毁)；
  3. **多端编辑在线感知防踩踏锁** (`lock:*`：维持 30s TTL 租约心跳)；
  4. **手机/快捷指令碎片灵感快投箱** (`drop:*` / `quick_drops_index`：7 天自动生命周期)。
* **开发约束**：新增任何用户个性化配置项，一律扩展至 `app_settings`，避免污染主业务关系表。

### 3. 本地开发与反代公网域名规范 (Dev Proxy & Public Base URL)
* **本地开发 (`pnpm dev`)**：Vite 开发服务器运行于 3000 端口，配置 `/api` 代理转发至后端 8787 端口；本地开发默认密码为 `admin`。
* **反向代理 (`PUBLIC_BASE_URL`)**：当容器部署在反向代理（Nginx / Caddy / NPM / CF Tunnel）后方时，外部审稿分享链接与灵感快投 Webhook 地址必须自适应公网域名。
* 解析优先级：`settings.public_base_url` > `env.PUBLIC_BASE_URL` > `X-Forwarded-*` 标头 > `window.location.origin`。

---

## 🎨 四、UI/UX 与交互准则 (Design & Usability)

1. **视觉风格（瑞士杂志/编辑部风）**：
   * 保持温润、克制、明亮的浅色编辑部调性（Stone 灰度 + Rose 主强调色）。
   * 严禁滥用深色赛博风、大面积紫黑渐变、厚重不规则投影或无意义的装饰性线条。
2. **全站 UI 统一组件约束**：
   * 全站所有下拉选择交互必须统一使用 `CustomSelect` 自定义组件，严禁在业务界面中使用系统原生 `<select>` 标签。
3. **移动端深度适配 (Mobile First on iOS Safari)**：
   * 必须保持 iPhone Safari 兼容性（包括 `safe-area-inset-bottom` 适配、底部导航 Dock、侧滑抽屉、触控点尺寸）。
   * 徽标（Badge）渲染必须严格校验 `typeof badge === 'number' && badge > 0`，防止空徽标显示为红点。
4. **全局快捷键规范**：
   * 全局指令搜索面板：`Ctrl+P` / `Cmd+P`（全平台通用）及 `/`（非输入状态下）。
   * 快速新建选题：`N`（非输入状态下）。
   * 弹窗关闭：`Esc`。
   * 文案专注模式：`Ctrl+Shift+F` / `Cmd+Shift+F`。
   * 录音提词器：`Ctrl+Shift+P` / `Cmd+Shift+P`。
   * 输入框与可编辑元素（`INPUT`, `TEXTAREA`, `contenteditable`）内禁止误触发全局快捷键。
5. **文案防丢保障**：
   * 文案编辑器需保持 1.5s 防抖本地暂存，并在 `visibilitychange` 与 `pagehide` 时触发即时同步；保存携带 `base_version` 原子校验防冲突。

---

## 🚀 五、常用工作流与命令 (Verification Workflow)

* **本地开发**：`pnpm dev`（启动 Vite 前端热重载与本地 Node API）
* **运行全量自动化测试**：`pnpm test:run`（Vitest，修改后必跑）
* **类型检查与生产构建**：`pnpm build`（包含前端 SPA 构建与服务端 `build:server`）
* **本地单机生产运行**：`pnpm start`
* **Podman / Docker 容器构建与编排**：
  * 构建本地镜像：`podman build -t topic-kanban:latest .`
  * 启动容器服务：`podman compose up -d` 或 `docker compose up -d`
