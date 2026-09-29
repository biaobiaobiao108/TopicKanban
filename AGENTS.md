# 项目 Agent 协作规则与开发指南 (AGENTS.md)

## 📌 一、铁律规则 (Ironclad Rules)

- **时区统一**：用户可见日期、自然日边界和日历运算一律以 `Asia/Shanghai`（北京时间，UTC+8）为业务时区；时间戳统一存 UTC，经过时长直接比较 UTC 瞬间，禁止只给一端额外加 8 小时。
- **Safari 优先适配**：macOS Safari 是首要桌面浏览器，前端改动以最新正式版 Safari 为优先验证目标；优先使用标准 API、特性检测和明确的降级反馈，涉及中文输入法、剪贴板、视口、滚动、弹窗或 PWA 的改动须专门检查 Safari 行为。

1. **代码修改后自动提交 Git（按需分级验证）**：
   * 每次完成修改并通过对应层级的验证后，必须立即自动执行一次规范清晰的本地中文 `git commit`：
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

本项目为**面向视频创作者专属的「选题生产工作台」**。核心业务围绕选题生命周期推进，包含 3 个活跃阶段与 2 个归档状态：

* `inbox`（收集箱）：刚发现的线索或灵感碎片
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
  1. **全局偏好设置** (`app_settings`：语速、主题、排版、演播气口库 `voiceover_cues`、反代公网域名 `public_base_url`、停滞阈值 `stale_days`、回收站保留天数 `trash_retention_days` 等)；
  2. **免登录外部审稿只读快照** (`share:*` / `topic_share:*`：支持设定 TTL 自动物理销毁)；
  3. **多端编辑在线感知防踩踏锁** (`lock:*`：由 `AppKV` 内部的内存 LeaseMap 隔离维护，维持 30s TTL 租约心跳，零磁盘 I/O 以杜绝高频碎片与 WAL 膨胀)；
  4. **手机/快捷指令碎片灵感快投箱** (`drop:*` / `quick_drops_index`：7 天自动生命周期)。
* **开发约束**：新增任何用户个性化配置项，一律扩展至 `app_settings`，避免污染主业务关系表。

### 2.1 内存生命周期与峰值治理 (Memory Governance)
* **查询缓存分层**：TanStack Query 默认 `gcTime` 为 2 分钟；稳定配置 5 分钟、分页列表 60 秒、详情 90 秒、指令搜索 30 秒。条件查询必须同时设置 `enabled` 与 `subscribed`，未激活的详情 Tab 不得持有订阅；指令面板关闭时移除 `command-topic-search` 查询族。
* **避免重复数据集**：`today-focus` 只在 Today 页面请求；导航数量使用轻量 `/api/topics/summary` 的服务端结果，不在客户端手工推算聚合数量。
* **模块缓存必须有界**：模块级 Map、内存缓存和 localStorage 缓存必须设置容量或 TTL。当前 Bilibili 封面缓存最多 128 项、有效期 30 天；退出登录和 401 流程必须清理 QueryClient 与远程存储内存缓存。正在保存的草稿请求不得强制取消，使用 generation 标记防止完成后的旧响应重新污染缓存；永久删除选题时同步清理该选题缓存。
* **服务端控制峰值**：批量数据优先一次加载并通过 ID Map 恢复排序，禁止对同一批实体执行并发 N+1 详情加载；备份导出不得重复加载完整 bootstrap，分析接口只查询实际需要的字段。
* **大文件避免重复序列化**：备份下载直接以 JSON Blob 响应；导入仅在客户端状态中保留 `File` 与摘要，保持 5 MB 限制，确认恢复时再读取和提交文件内容。
* **体验与数据契约优先**：以上治理不得改变 Today 返回结构、备份字段、编辑器自动保存、防冲突校验、拖拽行为或用户可见数据量；新增优化应优先减少长期驻留和重复副本。

### 2.2 存储碎片收敛、空闲页复用与物理收缩规范 (Storage Compaction & Freelist Policy)
* **空闲页复用优先原则 (Freelist-first)**：
  - SQLite 的 Freelist（内部空闲页池）是边写边改场景下极速复用、避免频繁向操作系统申请磁盘扇区的核心机制；
  - 单个/批量永久删除选题（`permanentlyDeleteTrashedTopics`）、清空回收站以及回收站超期清理**均采用标准 SQL `DELETE`，严禁在日常删除业务流中自动调用 `VACUUM`**，杜绝全库克隆重写导致的写放大（SSD 磨损）与并发排他写锁阻塞；
  - 释放的页面自然保留在内部 Freelist 中，供后续新建选题、修改正文和添加素材时直接原地复用。
* **主动收缩与物理归还 (Manual VACUUM)**：
  - 仅在用户通过系统设置主动触发整理（`POST /api/system/storage/vacuum`）时，才执行 `PRAGMA wal_checkpoint(TRUNCATE)` 与 `VACUUM`，将释放的空闲页截断归还宿主机操作系统；
  - 设置面板通过 `GET /api/system/storage` 提供真实的物理文件大小、WAL 大小与空闲页指标，让用户知情并自主决定何时整理。
* **回收站生命周期治理**：
  - 选题软删除进入回收站后，遵循 `app_settings.trash_retention_days` 设定（默认 30 天，0 为从不清理）；
  - 进入回收站视图时自动识别并物理级联清除超期选题，释放页面进入 Freelist 自然复用，杜绝废弃历史文案与素材无限积压。
* **高频租约内存化隔离**：协同编辑锁等秒级高频心跳交互数据严禁落盘写 SQLite，必须由内存 LeaseMap 进行并发控制。

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

## 🎨 四、UI/UX 与文人笔记设计系统 (The Literary Editorial Design System)

1. **风格基调（文人笔记的内敛、克制与纯净质感）**：
   * **核心色彩语义化**：严禁在业务组件中直接硬编码 `text-stone-900` / `bg-white dark:bg-stone-900` 等具象颜色类；统一使用核心设计变量：暖白画布（`--canvas`）、表面卡片（`--surface`）、石墨正文（`--ink`）、次要微墨（`--ink-muted`）、极细淡线（`--line` 或 `--line/50`）、复古松柏军绿（`--accent` 聚焦/行动强调色）、沉敛朱砂红（`--h1-color` 卷首印章点睛与危险提示）。在 4 套主题（纸境、浅色、深色、跟随系统）下自动协调一致。
   * **去 AI Slop 铁律（杜绝机械感、炫目彩色与多层嵌套方盒）**：
     - **严禁花哨彩色小网格**：禁止使用 5 列彩色小表格或高饱和度大彩字堆砌 KPI（如扎眼的红绿黄紫大数字），数据指标流统一以石墨文字（`--ink`）、次要微墨（`--ink-muted`）与等宽数值（`font-mono tabular-nums`）克制呈现；
     - **去封闭硬方框**：优先依靠留白与柔和底色层级（`--canvas` 与 `--surface`）组织信息；摘录、引用与当前行动一律采用出版物规范的左侧单立引线（`border-l-2 border-l-[var(--accent)]`）或柔和无边框画布浅底，严禁密集斑马线与粗边框嵌套方盒；
     - **表格与网格极致通透**：表格与日历单元格采用极细淡线（`divide-[var(--line)]/30`、`border-[var(--line)]/35`），表头与浮层采用半透明微磨砂质感。
   * **微胶囊与微晶片交互规范 (Micro-capsules & Micro-chips)**：
     - 范围过滤栏、视图切换器与状态流转分段器统一采用轻盈微胶囊设计（`rounded-full bg-stone-500/[0.04] p-1`）；
     - 常规操作按钮、状态徽标与行内操作一律采用无边框轻量微晶片，默认纯净半透明或极浅微底，鼠标悬浮时才平滑响应轻浅底色或极细淡线，禁止五颜六色、生硬刻板的大胶囊；
     - 分段器与 Tab 标签页采用无外边框设计，依靠激活项浅底色（`bg-[var(--surface)]` 或 `bg-[var(--accent)]/10`）体现选中。
   * **表单控件**：输入框与文本域采用自然浅底微圆角（`rounded-xl bg-stone-500/[0.03] dark:bg-stone-800`，聚焦时呈现松柏强调色）；同一组输入控件统一 `min-height`、内边距和行高；占位符统一使用 `placeholder:text-stone-400 dark:placeholder:text-stone-500`。
   * **排版与中文输入**：
     - 左侧主导航与工作台顶栏当前行动模块字号适中清晰，状态表述简洁（杜绝冗余重复，如“14天 14d”）；
     - 文案编辑器全面兼容中文输入习惯，Markdown 快捷语法对中文全角符号（如 `》` 触发引用块）保持宽容与流畅解析。

2. **全站 UI 统一组件与稳定性约束**：
   * **顶栏与标签栏的绝对稳定性 (Absolute Stability of Navigation Tabs)**：
     - 严禁顶栏分段器或导航 Tabs 因为子状态异步加载（如待办列表就绪、资料计数更新）而动态增加数字徽标，导致分段器宽度发生突变与伸缩抖动；
     - 导航标签必须保持布局与长度绝对稳定，统计数量应在工作台专门的摘要卡片或列表局部流中呈现。
   * **抽屉平滑动画与视口防抖 (Drawer Smoothness & preventScroll)**：
     - 侧边抽屉（快投箱、事实参考、大纲抽屉等）位移动画必须保持克制平滑（如 `translate3d(24px, 0, 0)` -> 0），禁止过冲反弹；
     - 抽屉展开自动聚焦时，必须显式传递 `{ preventScroll: true }`，杜绝因浏览器原生 `scrollIntoView` 导致的外层视口瞬间剧烈左冲回弹。
   * **严禁原生悬停提示 (Zero Native Tooltips / title 属性禁令)**：
     - 全站所有按钮、药丸、图表与列表项**严禁随意添加系统原生 `title="..."` 悬停提示框**，杜绝系统悬停黄黑弹窗破坏文人笔记的沉浸质感；
     - 语义与无障碍辅助必须统一使用标准 `aria-label`。
   * **全站下拉与日期统一**：全站所有下拉选择统一使用 `CustomSelect`，严禁原生 `<select>`；日期统一使用 `DateInput`，严禁原生 `<input type="date">`。
   * **浮层与操作菜单 Portal 化**：全站所有浮层、操作菜单统一使用 `FloatingMenu` 或 `CustomSelect`（通过 `createPortal` 挂载至 `document.body`），严禁内嵌在 `overflow` 容器内避免被截断。
   * **严禁浏览器原生弹窗 (Zero Native Dialogs)**：
     - 二次确认与破坏性操作必须统一使用 `ConfirmDialog`；
     - 即时状态轻提示必须统一使用 `useToast`，**严禁使用原生 `window.confirm`、`window.alert` 或 `window.prompt`**；
     - 所有模态弹窗（`Modal` / `ConfirmDialog`）必须通过 `createPortal` 挂载到 `document.body`，且内置 `Escape` 监听、焦点锁定与 `body` 滚动穿透锁定。
   * **滚动容器规范**：全站所有局部滚动容器统一使用 `FloatingScrollbar` 组件并隐藏原生滚动条。
   * **异步列表操作**：禁止用共享 `isBusy` / `loading` 状态同时切换整列列表项的 `disabled`、透明度或视觉 class；操作期间未受影响项必须保持 DOM 节点与布局绝对稳定。
3. **移动端深度适配 (Mobile First on iOS Safari)**：
   * 必须保持 iPhone Safari 兼容性（包括 `safe-area-inset-bottom` 适配、底部导航 Dock、侧滑抽屉、触控点尺寸）。
   * 徽标（Badge）渲染必须严格校验 `typeof badge === 'number' && badge > 0`，防止空徽标显示为红点。
4. **全局快捷键规范**：
   * 全局指令搜索面板：macOS 使用 `Command+/`，Windows 使用 `Alt+/`；`/` 可在非输入状态下打开。
   * 快速新建选题：`N`（非输入状态下）。
   * 弹窗关闭：`Esc`。
   * 文案专注模式：`Ctrl+Shift+F` / `Cmd+Shift+F`。
   * 录音提词器：`Ctrl+Shift+P` / `Cmd+Shift+P`。
   * 输入框与可编辑元素（`INPUT`, `TEXTAREA`, `contenteditable`）内禁止误触发全局快捷键。
5. **文案防丢保障**：
   * 文案编辑器需保持 1.5s 防抖本地暂存，并在 `visibilitychange` 与 `pagehide` 时触发即时同步；保存携带 `base_version` 原子校验防冲突。
6. **4 套主题生态**：
   * 支持暖沙纸境 (`warm_paper`)、经典浅色 (`light`)、深色夜间 (`dark`)、跟随系统 (`system`)。

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

本项目统一采用 Bun-first 工作流：能由 Bun 执行的依赖安装、开发服务、测试、构建和 CLI 命令都使用 Bun，不使用 Node.js/npm 作为默认运行方式。

* **本地开发**：`bun run dev`（启动 Bun HTML Bundler 热重载与本地 Bun API 的单进程全栈服务）
* **分级验证命令指引**：
  * **按需局部单测（日常开发首选）**：`bun test tests/<module>.test.ts` 或 `bun test <filter>`（毫秒级定向反馈）；
  * **快速类型校验**：`bunx tsc --noEmit`（无需完整打包，秒级校验 TS 类型）；
  * **生产构建测试**：`bun run build`（包含前端 SPA 与 Bun 服务端打包，涉及构建链路或打包发布时执行）；
  * **全量自动化测试**：`bun test`（全量回归验证，涉及底层重构或重要节点发布时执行）；
  * **测试豁免**：纯文档（Markdown）、代码注释、`docs/` 静态展示页等无运行时代码改动一律跳过测试与构建。
* **交互回归要求**：修改表单尺寸、占位符或列表异步状态时，必须补充对应的单元/集成回归测试，并在开发环境完成必要的浏览器交互检查；至少覆盖同组控件高度一致、占位符样式符合规范，以及异步请求期间未受影响列表项不会被禁用或改变布局。
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
