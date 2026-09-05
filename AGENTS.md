# 项目 Agent 协作规则与开发指南 (AGENTS.md)

## 📌 一、铁律规则 (Ironclad Rules)

1. **代码修改后自动提交 Git（按需分级验证）**：
   * 每次完成修改并通过对应层级的验证后，必须立即自动执行一次规范清晰的本地 `git commit`：
     * **纯文档/注释/静态展示页修改**（如 `.md`、`docs/` 目录、代码注释）：**无需**运行单元测试或生产构建，修改完成后直接提交；
     * **常规功能开发与 Bug 修复**：遵循“最小但足够”原则，优先运行改动相关的局部单测（`bun test tests/xxx.test.ts`）或通过 `bun run build`（或 `bunx tsc --noEmit`）校验类型与构建无误；
     * **全局架构调整/公共模块重构/发版前**：必须通过全量测试（`bun test`）与生产构建测试（`bun run build`）。
2. **全栈bun开发**：
   * 必须使用 Bun 进行依赖安装与脚本执行。
   * 本项目遵循 Bun-first 运行时规范：本地开发、测试、构建及 CLI 工具只要 Bun 能够支持，就必须使用 Bun，不得用 Node.js 替代。对于带有 `#!/usr/bin/env node` 的本地 CLI，使用 `bun run --bun <command>` 或 `bunx --bun <command>` 显式让 Bun 执行。
3. **安全操作**：
   * 运行任何破坏性命令（包括但不限于删除关键文件、重置数据库结构、强制清空存储等）前，必须向用户明确说明风险并获得确认。删除文件优先使用安全机制（`trash` > `rm`）。
---

## 🎬 二、产品定位与核心状态机 (Domain & Lifecycle)

本项目为**面向视频创作者专属的「选题生产工作台」**。核心业务围绕选题生命周期推进，包含 4 个活跃阶段与 2 个归档状态：

* `inbox`（收集箱）：刚发现的线索或灵感碎片
* `approved`（已立项）：故事线与核心反差确立，准备开工
* `scripting`（写稿中）：正在撰写解说与分镜文案
* `production`（待制作）：文案定稿，进入录音与剪辑制作
* `published`（已发布）：成片已上线，沉淀播放与互动数据
* `icebox`（搁置）：暂缓或制作条件不成熟

> 具体的业务视图、字段结构与交互逻辑以代码库中的 TypeScript 类型定义（`src/types/`）与数据模型为单一真实来源。

---

## 🛠️ 三、技术栈与运行时架构规范 (Tech Stack & Architecture)

### 1. 核心技术栈
* **前端核心**：React 19 + TypeScript + Bun HTML Bundler + Tailwind（通过 `bun-plugin-tailwind@0.1.2`，插件内置 Tailwind 4.1.14）
* **路由与动效**：React Router 7（内置 View Transitions 视图平滑过渡）+ TanStack Query 5
* **看板与拖拽**：`@dnd-kit/core` + `@dnd-kit/sortable`
* **文案编辑**：`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-character-count` + 自定义原子内联扩展
* **图标系统**：`lucide-react`
* **服务端与校验**：Bun 原生 HTTP Server 与 `Bun.serve({ routes })` REST API（基于 `src/server/schemas.ts` 集中管理 Zod 运行时请求校验与结构化错误响应，应用组合位于 `src/server/app.ts`，业务路由位于 `src/server/routes/`）
* **鉴权体系**：Web Crypto HMAC-SHA256 签名无状态 Token（TTL 7 天）

### 1.1 后端业务模块边界

* `src/server/app.ts` 只负责应用组装、全局 body 限制、鉴权中间件和路由注册，不承载具体业务 SQL 或业务流程。
* `src/server/schemas.ts` 作为统一的运行时请求校验层（基于 Zod 4），确保 API 入参与领域模型一致，提供类型安全的字段解析与统一的 `jsonValidationError` 响应。
* `src/server/routes/` 按业务领域注册 HTTP 路由，负责请求解析、参数校验、状态码和响应格式；路由层禁止直接调用 `db.prepare`、编写 SQL 或拼装跨表事务。
* `src/server/repositories/` 按业务领域负责 SQLite 查询、写入、事务、结果标准化和关联数据加载；涉及多个表的原子操作必须在对应 repository 内完成。
* 新增或修改业务功能时，应同时更新对应的 route 与 repository，并补充对应的单测或集成测试；公共类型仍以 `src/types/` 为前后端契约来源。
* `src/server/native.ts`、`sqlite.ts`、`schemas.ts`、`appKv.ts` 和 `apiShared.ts` 属于基础设施/共享辅助层，不应反向依赖业务 route 或 repository。

### 2. Bun 单运行环境与存储规范 (Storage & Runtime Strategy)

本项目只支持 **Bun + SQLite 单运行环境**，可直接运行，也可通过 Podman / Docker 一体化容器部署：

| 运行时环境 | 服务端入口 | 主关系数据库 (`DB`) | 键值与临时存储 (`KV`) | 静态文件托管 |
| :--- | :--- | :--- | :--- | :--- |
| **Bun / 本地容器** (唯一运行时) | `src/server/server.ts` (`Bun.serve({ routes })`) | SQLite (`bun:sqlite` + WAL，文件 `./data/kanban.db`) | SQLite `_kv_store` 表 (`AppKV`) | Bun 独立托管 SPA `dist/` |

#### 容器镜像用户约束：
* 生产镜像必须保持 Dockerfile 未显式设置 `USER` 时的默认 root 用户运行。任何任务不得新增、删除或修改镜像用户，也不得通过 Compose 或 workflow 覆盖容器用户；只有用户明确授权时才可改变此约束。

#### 存储分工原则：
* **主业务持久库 (`DB` / SQLite)**：负责强关系型业务资产（`topics`, `topic_todos`, `sources`, `timeline_events`, `people`, `person_relationships`, `drafts`, `draft_citations`, `tags`, `topic_tags`, `published_videos`, `commercial_deals`, `commercial_deal_activities`）。
* **键值存储 (`KV` / `_kv_store`)**：负责非关系型全局配置与轻量交互数据：
  1. **全局偏好设置** (`app_settings`：语速、主题、排版、演播气口库 `voiceover_cues`、反代公网域名 `public_base_url`、停滞阈值 `stale_days` 等)；
  2. **免登录外部审稿只读快照** (`share:*` / `topic_share:*`：支持设定 TTL 自动物理销毁)；
  3. **多端编辑在线感知防踩踏锁** (`lock:*`：维持 30s TTL 租约心跳)；
  4. **手机/快捷指令碎片灵感快投箱** (`drop:*` / `quick_drops_index`：7 天自动生命周期)。
* **开发约束**：新增任何用户个性化配置项，一律扩展至 `app_settings`，避免污染主业务关系表。

### 3. 本地开发与反代公网域名规范 (Local Bun Server & Public Base URL)
* **本地开发 (`bun run dev`)**：Bun HTML Bundler 热重载与 Bun.serve 在同一进程运行于 3030 端口，页面、静态资源和 `/api` 由同一个服务同源提供；不再使用独立前端开发服务器或跨端口代理。本地开发默认密码为 `admin`。
* **反向代理 (`PUBLIC_BASE_URL`)**：当容器部署在反向代理（Nginx / Caddy / NPM）后方时，外部审稿分享链接与灵感快投 Webhook 地址必须自适应公网域名。
* 解析优先级：`settings.public_base_url` > `env.PUBLIC_BASE_URL` > `X-Forwarded-*` 标头 > `window.location.origin`。

### 4. 外部音视频与社交平台链接智能识别架构（全量客户端直连原则 All Client-Side Direct Parsing）
* **背景与风控考量**：本项目收集的资料均来自国内各大视频与社交媒体网站（Bilibili、抖音、小红书、微博、知乎、微信公众号、快手等）。服务端抓取容易触发平台风控；相反，用户本人的原生浏览器网络（家庭/移动宽带原生 IP）干净度与信任度更高。
* **架构铁律**：
  1. **严禁服务端抓取**：严禁将国内视频与社交媒体链接交给服务端代理抓取；
  2. **统一客户端引擎**：全站所有链接解析与分享文本处理必须通过 `src/lib/clientUrlParser.ts` 在客户端本地执行；
  3. **分平台直连机制**：
     * **Bilibili**：客户端原生 JSONP（`fetchBilibiliVideoData`）直连 B 站 open API，零风控、毫秒级获取视频真实标题、UP主、完整简介、发布日期、封面图以及播放/点赞/投币/收藏等全套互动数据；
     * **YouTube**：客户端官方 oEmbed CORS（`fetchYoutubeVideoData`）直连拉取标题、频道作者与封面；
     * **抖音 / 快手 / 小红书 / 微博 / 微信 / 知乎**：客户端内置语义提取器，自动剥离移动端复杂的 App 复制口令与尾缀，精准提取作者、纯净标题与内容摘要。

---

## 🎨 四、UI/UX 与温润编辑部设计系统 (The Editorial Design System)

1. **视觉风格（温润编辑部微质感 Warm Editorial Clean）**：
   * 保持温润、克制、明亮的浅色编辑部调性（Stone 灰度 + Rose 主强调色）。
   * **容器卡片**：统一采用 `rounded-2xl border border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xs`。
   * **悬停交互**：卡片支持轻盈微抬升 `hover:shadow-card hover:-translate-y-0.5 transition-all duration-200`。
   * **胶囊徽章 (Tinted Pills)**：状态徽标统一为透底色药丸 `bg-{color}-500/10 text-{color}-700 dark:text-{color}-300 rounded-full font-bold px-2.5 py-0.5 text-xs`。
   * **表单控件**：输入框与文本域统一为 `rounded-xl border border-stone-200/80 dark:border-stone-700 bg-stone-500/[0.03] dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-800 focus:border-rose-500`。
   * **表单尺寸与提示**：同一组输入控件必须统一 `min-height`、内边距和行高；日期字段默认使用 `min-h-10`。字段格式说明放在 `placeholder` 或帮助文本中，不把冗长格式说明塞进 label；占位符必须明显弱于正文，统一使用 `placeholder:text-stone-400/60 dark:placeholder:text-stone-500/60`，且不能替代可见 label。
   * **主行动按钮**：`rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold shadow-2xs`。
2. **全站 UI 统一组件约束**：
   * 全站所有下拉选择交互必须统一使用 `CustomSelect` 自定义组件，严禁在业务界面中使用系统原生 `<select>` 标签。
   * 全站所有日期输入交互必须统一使用 `DateInput` 自定义组件（支持输入 8 位连续数字如 `20260831` 或 ISO 标准串 `2026-08-31`），严禁使用系统原生 `<input type="date">`，避免部分浏览器在直接键入数字时将年份解析为六位数（如 `202608-03-01`）。
   * 全站所有浮层、操作菜单与自定义下拉列表（如表格列配置、阶段流转菜单、操作选项）必须统一使用 `FloatingMenu` 或 `CustomSelect`（基于 `createPortal(..., document.body)` 与 `useFloatingPosition` 实现），严禁使用 `absolute` 定位内嵌在滚动容器或表格中，杜绝因 `overflow: hidden` / `overflow: auto` 或层叠上下文导致的菜单被截断问题。
   * **严禁浏览器原生弹窗 (Zero Native Dialogs)**：
     - 全站所有二次确认与破坏性操作（如移入回收站、永久删除、批量删除、覆盖恢复数据备份等）必须统一使用 `ConfirmDialog` 模态组件（内置 `danger` 玫瑰红、`warning` 琥珀黄、`primary` 墨石黑三种语义色调与异步 `isLoading` 状态）；
     - 所有即时状态轻提示必须统一使用 `useToast`（支持 `success`、`error`、`info`），**严禁在任何业务界面中使用浏览器原生 `window.confirm`、`window.alert` 或 `window.prompt`**；
     - 所有自定义模态弹窗（`Modal` / `ConfirmDialog`）必须通过 `createPortal` 挂载到 `document.body`，且必须内置 `Escape` 键监听、焦点锁定（Focus trap）与 `body` 滚动穿透锁定。
   * **异步列表操作**：禁止用共享 `isBusy` / `loading` 状态同时切换整列列表项的 `disabled`、透明度或视觉 class；新增、完成、编辑、删除等操作只锁定目标项，新增表单使用自身 `isSubmitting` 防重复。操作期间未受影响项的 checkbox、DOM 节点和布局必须保持稳定，避免整列闪烁。
3. **移动端深度适配 (Mobile First on iOS Safari)**：
   * 必须保持 iPhone Safari 兼容性（包括 `safe-area-inset-bottom` 适配、底部导航 Dock、侧滑抽屉、触控点尺寸）。
   * 徽标（Badge）渲染必须严格校验 `typeof badge === 'number' && badge > 0`，防止空徽标显示为红点。
4. **全局快捷键规范**：
   * 全局指令搜索面板：`Ctrl+/` / `Cmd+/`（全平台通用）及 `/`（非输入状态下）。
   * 快速新建选题：`N`（非输入状态下）。
   * 弹窗关闭：`Esc`。
   * 文案专注模式：`Ctrl+Shift+F` / `Cmd+Shift+F`。
   * 录音提词器：`Ctrl+Shift+P` / `Cmd+Shift+P`。
   * 输入框与可编辑元素（`INPUT`, `TEXTAREA`, `contenteditable`）内禁止误触发全局快捷键。
5. **文案防丢保障**：
   * 文案编辑器需保持 1.5s 防抖本地暂存，并在 `visibilitychange` 与 `pagehide` 时触发即时同步；保存携带 `base_version` 原子校验防冲突。
6. **5 套主题生态**：
   * 支持北欧冷杉 (`nordic_frost`)、暖沙纸境 (`warm_paper`)、经典浅色 (`light`)、深色夜间 (`dark`)、跟随系统 (`system`)。

7. **字体与混排规范**：
   * 中文业务文本、标签、按钮与说明文字使用现有无衬线业务字体栈；不要将含中文的整块内容统一套用 `font-mono`。
   * 日期、数字、金额与页码等数值按需使用 `tabular-nums`；代码、URL、JSON、BV 号、快捷键、时间码和提词器标记等真正需要等宽的内容才保留 `font-mono`。
   * 混合文本拆分中文标签与数值；同一语义组件统一字号、字重、行高和字间距，排期/截稿、日历事项、卡片统计与数据摘要保持一致。
   * 主题样式选择器限定到专用标识类，禁止用宽泛的 `.font-mono` 或容器选择器污染其他业务文本。

8. **编辑后跨视图刷新规范**：
   * 编辑入口先乐观同步当前实体及相关已缓存的列表、分页、日历、摘要、详情和嵌套关联；保存成功后用服务端结果校正。
   * 保存失败回滚本次修改并重新校验相关查询；连续编辑时新提交字段优先，旧请求响应不得覆盖较新的编辑结果。
   * 删除同步移除已有缓存项并校正分页信息；新建实体不强行插入无法确定排序位置的分页，交由查询刷新获取。
   * 聚合、统计和筛选结果不手工猜测，保留查询失效与后台刷新作为最终权威校正。
   * 选题至少同步 `workspace`、`today-focus`、看板分页、选题库、标签选题和命令搜索；人物、标签、发布视频与商单同步其列表、详情、摘要及选题嵌套关联。

---

## 🚀 五、常用工作流与命令 (Verification Workflow)

本项目统一采用 Bun-first 工作流：能由 Bun 执行的依赖安装、开发服务、测试、构建和 CLI 命令都使用 Bun，不使用 Node.js/npm 作为默认运行方式。Playwright CLI 使用 Bun 显式运行：

```bash
bun run test:e2e
```

其中 `test:e2e` 已通过 `bun run --bun playwright test` 强制 Playwright 在 Bun 运行时下执行。

* **本地开发**：`bun run dev`（启动 Bun HTML Bundler 热重载与本地 Bun API 的单进程全栈服务）
* **分级验证命令指引**：
  * **按需局部单测（日常开发首选）**：`bun test tests/<module>.test.ts` 或 `bun test <filter>`（毫秒级定向反馈）；
  * **快速类型校验**：`bunx tsc --noEmit`（无需完整打包，秒级校验 TS 类型）；
  * **生产构建测试**：`bun run build`（包含前端 SPA 与 Bun 服务端打包，涉及构建链路或打包发布时执行）；
  * **全量自动化测试**：`bun test`（全量回归验证，涉及底层重构或重要节点发布时执行）；
  * **测试豁免**：纯文档（Markdown）、代码注释、`docs/` 静态展示页等无运行时代码改动一律跳过测试与构建。
* **交互回归要求**：修改表单尺寸、占位符或列表异步状态时，必须补充 Playwright 回归；至少断言同组控件高度一致、占位符样式符合规范，以及异步请求期间未受影响列表项不会被禁用或改变布局。
* **日常 CI 自动化门禁 (`.github/workflows/ci.yml`)**：推送到 `master` 或发起 PR 时自动执行类型校验、全量测试、前后端构建及包体积预算检测（`check:bundle`）。
* **本地单机生产运行**：`bun run start`
* **Podman / Docker 容器构建与编排**：
  * 构建本地镜像：`podman build -t topic-kanban:latest .`
  * 启动容器服务：`podman compose up -d` 或 `docker compose up -d`

---

## 🌐 六、GitHub Pages 静态展示落地页规范 (Showcase Page Strategy)

本项目在 `docs/` 目录下维护独立的产品宣传与交互展示落地页，专供 GitHub Pages 免构建静态托管：

1. **单一数据源原则 (Single Source of Truth)**：
   - 静态展示页全站唯一定位于 `docs/index.html`，静态图标存放于 `docs/icon.png` 与 `docs/apple-touch-icon.png`，配有 `docs/.nojekyll` 避免 Jekyll 过滤；
   - 严禁在根目录重复创建冗余的 `showcase.html`，根目录 `index.html` 专属为主应用 React SPA 入口。
2. **零构建与极速渲染标准**：
   - 必须采用 Tailwind CSS Play CDN + Lucide Icons + 原生 Vanilla JS，零打包构建依赖，任意静态托管平台即开即用；
   - 动效必须遵循现代 Web 标准：原生 `IntersectionObserver` 驱动 GPU 硬件加速滚动入场、3D Tilt 视差微倾斜、动态 Spotlight 聚光灯遮罩与数字缓动插值，全面适配 `prefers-reduced-motion`。
3. **内容与交互同步**：
   - 展示页内置 5D 故事评估罗盘实时拖拽沙盒、起承转合四幕叙事流水线、录音提词器模拟器与全局指令面板模拟器；
   - 仓库链接统一绑定官方地址：`https://github.com/biaobiaobiao108/TopicKanban`。
