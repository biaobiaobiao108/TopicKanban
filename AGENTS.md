# 项目 Agent 协作规则与开发指南 (AGENTS.md)

## 📌 一、铁律规则 (Ironclad Rules)

1. **代码修改后自动提交 Git **：

   * 每次完成代码修改、写完一个新功能或 Bug 修复并通过构建测试（`pnpm build`）后，必须立即自动执行一次规范清晰的本地 `git commit`。严格执行原子提交。
2. **包管理器优先**：

   * 必须优先使用 `pnpm` 进行依赖安装与脚本执行，`npm` 仅作极端情况兜底。
3. **安全操作**：

   * 运行任何破坏性命令（包括但不限于删除关键文件、重置数据库结构、强制清空存储等）前，必须向用户明确说明风险并获得确认。
4. **最小改动原则**：

   * 修改已有文件时只改动和当前任务直接相关的部分，不擅自进行大范围重构、改写无关组件风格或删除已有逻辑。

\---

## 🎬 二、产品定位与核心领域模型 (Domain Model)

本项目为**面向 Bilibili 叙事类视频（互联网人物、网红主播、荒诞事件、社会纪实）创作者专属的「选题生产工作台」**，并非通用看板。

### 1\. 核心生命周期（4 个活跃阶段 + 2 个归档状态）

* `inbox`（收集箱）：刚发现的线索或灵感碎片
* `approved`（已立项）：故事线与核心反差确立，准备开工
* `scripting`（写稿中）：正在撰写解说分段文案
* `production`（待制作）：文案定稿，进入录音与剪辑制作
* `published`（已发布）：成片已上线，沉淀播放与互动数据
* `icebox`（搁置）：暂缓或制作条件不成熟

### 2\. 核心设计准则

* **下一步行动（Next Action）**：每个选题必须明确当前最该做的一件具体行动，避免多任务停滞。
* **5 维故事评估模型**：人物张力、戏剧冲突、荒诞反差、素材完整度、主线成立度。
* **资料 3 级分层**：严格区分「事实（Fact）」、「线索（Clue）」、「素材（Material）」，并标明可靠度（已核实/待考证/存疑）。
* **时间线（Timeline）**：支持精确（年/月/日）与模糊时间精度（年/月、年份、未知）。
* **人物档案网（People Archive）**：独立的人物库、别名外号、平台主页及人物网状关系。
* **文案与片长换算**：编辑器内置语速换算（默认 280 字/分钟），实时换算视频预估时长。

\---

## 🛠️ 三、技术栈与架构规范 (Tech Stack \& Architecture)

### 1\. 技术栈构成

* **前端核心**：React 18 + TypeScript + Vite + TailwindCSS
* **看板交互**：`@dnd-kit/core` + `@dnd-kit/sortable`
* **文案编辑**：`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-character-count`
* **图标系统**：`lucide-react`
* **后端/API**：Cloudflare Pages Functions + Hono REST API (`functions/api/\\\[\\\[route]].ts`)
* **数据库/ORM**：Cloudflare D1 (SQLite) + Drizzle ORM
* **鉴权体系**：Web Crypto HMAC-SHA256 签名无状态 Token（TTL 7 天）

### 2\. 存储分工与数据边界原则 (Storage Strategy)

* **Cloudflare D1 (SQLite 业务主库)**：负责强关系型业务核心资产的持久化存储，包括：选题全生命周期 (`topics`)、事实与素材证据链 (`sources`)、时间线事件 (`timeline_events`)、人物档案网 (`people`/`relationships`)、分段文案草稿与引用 (`drafts`/`draft_citations`)、标签赛道 (`tags`)、成片发布复盘 (`published_videos`)。
* **Cloudflare Workers KV (边缘极速键值存储)**：负责非关系型全局配置与轻量边缘交互数据，包括：
  1. **全局偏好设置** (`app_settings`：文案朗读语速、视觉主题、未来新增的用户偏好等)；
  2. **免登录外部审稿只读快照** (`share:*` / `topic_share:*`：支持设定 TTL 自动过期物理销毁)；
  3. **多端编辑在线感知防踩踏锁** (`lock:*`：维持 30s TTL 租约心跳)；
  4. **手机/快捷指令碎片灵感快投箱** (`drop:*` / `quick_drops_index`：7 天自动生命周期)。
* **开发约束**：未来新增任何个性化用户配置项，一律扩展至 Workers KV 的 `app_settings`，避免污染 D1 关系型表结构。

\---

## 🎨 四、UI/UX 与交互准则 (Design \& Usability)

1. **视觉风格（瑞士杂志/编辑部风）**：

   * 保持温润、克制、明亮的浅色编辑部调性（Stone 灰度 + Rose 主强调色）。
   * 严禁滥用深色赛博风、大面积紫黑渐变、厚重不规则投影或无意义的装饰性线条。
2. **移动端深度适配 (Mobile First on iOS Safari)**：

   * 必须保持 iPhone Safari 兼容性（包括 `safe-area-inset-bottom` 适配、底部导航 Dock、侧滑抽屉、触控点尺寸）。
   * 徽标（Badge）渲染必须严格校验 `typeof badge === 'number' \\\&\\\& badge > 0`，防止空徽标显示为红点。
3. **全局快捷键规范**：

   * 全局指令搜索面板：`Ctrl+P` / `Cmd+P`（全平台通用）及 `/`（非输入状态下）。
   * 快速新建选题：`N`（非输入状态下）。
   * 弹窗关闭：`Esc`。
   * 输入框与可编辑元素（`INPUT`, `TEXTAREA`, `contenteditable`）内禁止误触发全局快捷键。
4. **文案防丢保障**：

   * 文案编辑器需保持 1.5s 防抖自动保存，并在 `visibilitychange` 与 `pagehide` 时触发即时同步。

\---

## 🚀 五、常用工作流与命令 (Verification Workflow)

* **本地开发**：`pnpm dev`
* **类型检查与生产构建**：`pnpm build`（每次改动提交前必须通过）
* **本地预览**：`pnpm preview`

