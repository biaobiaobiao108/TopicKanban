# 🎬 选题生产工作台

面向 Bilibili 人物、网红争议、主播事件和社会纪实类视频创作者的单用户生产工作台。系统围绕“下一步最该做什么”，覆盖线索收集、资料核验、故事梳理、文案写作、成片发布与数据复盘。

> 本文档描述当前仓库的实际实现。供外部开发者重开发使用的完整产品说明见 `/home/steelway/webapp/选题生产工作台-重开发交接文档.md`。

## 核心能力

- **选题生命周期**：`inbox`（收集箱）→ `approved`（已立项）→ `scripting`（写稿中）→ `production`（待制作），以及 `published`（已发布）和 `icebox`（搁置）。
- **今日聚焦**：结合置顶、优先级、阶段和更新时间生成今日工作列表，并提示停滞选题。
- **看板与选题库**：拖拽流转、服务端分页/排序/搜索、标签/人物筛选、快捷建卡、归档和回收站批量处理。
- **选题详情**：概览、5 维故事评分、资料、时间线、人物关系和文案工作区。
- **资料分层**：区分 `fact`、`clue`、`material`，并标记 `confirmed`、`unverified`、`rejected`。
- **人物档案**：维护别名、平台主页、语录、关联选题和人物关系；时间线事件可关联多个人物。
- **文案编辑**：Tiptap 富文本、大纲、引用、字数/片长换算、专注模式和提词器。
- **文案防丢**：输入停止 1.5 秒后写入浏览器恢复缓存；停止输入 45 秒后同步 D1；页面隐藏或离开时立即尝试同步。保存使用版本号防止旧请求覆盖新内容，冲突时由用户选择处理方式。
- **外部审稿分享 (Workers KV)**：支持一键生成免登录只读审稿快照链接（可设 6h/24h/3d/7d 有效期），外部配音/剪辑/画师免密码直接查阅，到期后 KV 自动物理销毁。
- **多端在线感知锁 (Workers KV)**：在写稿界面维持 15s 心跳租约（30s TTL），当手机或另一设备打开同选题时顶部弹出防冲突横幅，避免多端相互覆盖。
- **手机灵感快投箱 (Workers KV)**：提供极速 Webhook 接口，支持 iOS 快捷指令或手机分享菜单一秒直投碎片文字与链接，工作台顶栏实时红点提醒并支持一键转入收集箱。
- **发布复盘**：记录 BVID、链接、发布日期、当前播放与互动指标；浏览器通过 JSONP 直连 Bilibili。
- **备份恢复**：导入或导出包含全部业务实体的 JSON 备份。

## 技术架构

- React 18、TypeScript、Vite 6、Tailwind CSS 3
- React Router 7：模块和选题详情均有稳定 URL
- TanStack Query 5：统一服务端数据缓存与失效刷新
- `@dnd-kit`：看板与时间线拖拽
- Tiptap 2：富文本文案编辑
- Hono + Cloudflare Pages Functions
- Cloudflare D1（SQLite 业务主数据源）+ Cloudflare Workers KV（临时审稿分享、多端在线心跳锁、手机快投暂存）
- Vitest

```text
浏览器
  ├─ React Router + TanStack Query
  ├─ LocalStorage（仅登录 Token、UI 偏好、文案恢复缓存/待上传队列）
  └─ /api/* → Hono Pages Functions ──┬─→ Cloudflare D1（主业务持久存储）
                                     └─→ Cloudflare Workers KV（审稿快照/多端锁/快投箱）
```

本地与生产使用同一套 API 和 D1 访问逻辑。本地开发由 Wrangler 提供 Pages Functions 和本地 D1/KV。

鉴权按单用户场景设计：`APP_PASSWORD` 校验成功后签发 7 天有效的 HMAC-SHA256 Token；`/api/public/share/*` 为免密审稿公开接口，`/api/inbox/quick-drop` 使用独立的 `QUICK_DROP_TOKEN`，不接受工作台主密码。

## 页面路由

| 路径 | 页面 |
| --- | --- |
| `/today` | 今日聚焦 |
| `/kanban` | 选题看板 |
| `/topics/:id` | 选题详情 |
| `/database` | 全量选题库与回收站 |
| `/people` | 人物档案 |
| `/tags` | 标签与赛道 |
| `/published` | 已发布视频 |
| `/settings` | 偏好、连接状态和备份 |
| `/share/:token` | **外部免密只读审稿页 (KV)** |

`/` 和未知路径会跳转到 `/today`。Cloudflare Pages 的 SPA 回退允许直接打开深层路由。

## 数据模型

| 实体/表 | 用途 |
| --- | --- |
| `topics` | 选题主记录、状态、优先级、评分、下一步行动和软删除时间 |
| `sources` | 事实、线索和素材 |
| `timeline_events` | 故事时间线 |
| `timeline_event_people` | 时间线事件与人物的多对多关系 |
| `people` / `person_relationships` | 人物档案与人物关系 |
| `topic_people` / `topic_tags` | 选题与人物、标签的连接表 |
| `tags` | 内容赛道与标签 |
| `drafts` | 每个选题的一份富文本文案及保存版本号 |
| `draft_citations` | 文案中的资料引用快照 |
| `published_videos` | 成片与当前 Bilibili 指标 |
| `settings` | 阅读语速、主题等全局设置 |

TypeScript 契约以 `src/types/index.ts` 为准。修改数据结构时必须同步检查类型、`remoteStorage.ts`、服务端查询、API、`drizzle/0000_schema.sql` 和备份结构。

## API 概览

除 `POST /api/auth/login` 外，所有接口要求 `Authorization: Bearer <token>`。

| 资源 | 主要能力 |
| --- | --- |
| 系统 | 登录、健康检查、聚合初始化、备份、设置 |
| 选题 | 分页查询、筛选、排序、新建、修改、批量流转、移入回收站、恢复、永久删除 |
| 资料与时间线 | 按选题查询和 CRUD；时间线支持人物关联与批量排序 |
| 人物、关系、标签 | 查询和 CRUD |
| 文案与引用 | 文案版本化保存、冲突响应、引用管理 |
| 已发布视频 | 查询和 CRUD |

API 入口为 `functions/api/[[route]].ts`，系统和共享 API 能力拆到 `src/server/`。Bilibili 数据不经过 Cloudflare API。数据库查询与备份逻辑位于 `src/server/database.ts`。

## 本地开发

要求 Node.js 20+、pnpm 9+。

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:init:local
pnpm dev
```

在 `.dev.vars` 中设置本地 `APP_PASSWORD` 和独立的 `QUICK_DROP_TOKEN`，然后打开 `http://localhost:8798`。`pnpm dev` 会同时启动 Vite 和 Wrangler；浏览器只访问 Wrangler 地址，以确保页面、API 和本地 D1 使用同源环境。

常用命令：

```bash
pnpm test:run       # 当前已有单元测试
pnpm build          # TypeScript 检查 + 生产构建
pnpm preview        # 预览 Vite 构建产物（不提供 Pages API）
pnpm db:init:local  # 在 Wrangler 本地 D1 执行基线 schema
```

## Cloudflare 部署

### 1. 配置资源

新部署应创建自己的 D1，并把数据库 ID 写入对应环境配置。`KV` 是可选绑定，不存业务数据。

```bash
pnpm exec wrangler d1 create kanban
```

### 2. 初始化空数据库

当前项目只有测试数据，不提供旧数据迁移链。`drizzle/0000_schema.sql` 是空数据库的唯一结构基线：

```bash
pnpm db:init:remote
```

该命令会修改远程 D1，只应在确认目标数据库为空或已由项目方清空后执行。应用运行时不会自动建表或修补结构。

如果数据库是在独立视频归档支持加入前初始化的，部署新版代码前需执行一次结构升级：

```bash
pnpm db:upgrade:published:remote
```

该升级仅把 `published_videos.topic_id` 改为可空，已有视频记录会原样保留。新建数据库无需执行。

### 3. 配置密码并部署

在 Cloudflare Pages 中配置 Secret `APP_PASSWORD` 与独立的 `QUICK_DROP_TOKEN`，不要把任何凭据提交到仓库。更新 `QUICK_DROP_TOKEN` 后需同步更新 iOS 快捷指令中的 `X-Quick-Drop-Token` 请求头。

```bash
pnpm build
pnpm exec wrangler pages deploy dist
```

发布后至少验证：登录、创建/流转选题、深链刷新、时间线人物关联、文案 45 秒同步与冲突提示、回收站恢复、备份导出、`/api/health`。

## 文案保存语义

文案输入有三层保护：

1. **1.5 秒本地恢复缓存**：只写浏览器，不产生 Cloudflare D1 请求。
2. **45 秒云端防抖同步**：连续输入期间重新计时，减少 D1 写入费用。
3. **离开即时同步**：`visibilitychange`、`pagehide` 和组件卸载时尝试提交最新内容；失败内容保留在待上传队列。

API 保存携带 `base_version`，服务端用带版本条件的原子更新递增版本；不一致返回 HTTP 409。重新打开时若本地恢复草稿与云端版本不同，会在进入编辑器前要求明确选择，避免静默覆盖。

## 回收站与备份

- 删除选题只设置 `deleted_at`，关联数据保持不变。
- 回收站支持恢复或永久删除；永久删除会依赖外键级联清理关联数据。
- JSON 恢复会整体替换业务数据，执行前必须确认。
- 云端导入限制为 5 MiB 且最多 500 条原子写入语句，超限会在写入前拒绝。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `N` | 非输入状态下快速新建选题 |
| `Ctrl/Cmd + P`、`/` | 打开全局命令面板 |
| `Esc` | 关闭弹窗或浮层 |
| `Cmd/Ctrl + Shift + F` | 文案专注模式 |

## 目录结构

```text
kanban/
├── drizzle/0000_schema.sql       # 空 D1 的唯一 schema 基线
├── functions/api/[[route]].ts    # Hono API 入口与业务资源路由
├── src/
│   ├── components/               # 按产品模块组织的 React 组件
│   ├── hooks/useWorkspace.ts     # 工作区查询缓存与实体更新门面
│   ├── lib/
│   │   ├── remoteStorage.ts      # 唯一业务存储客户端、草稿缓存与上传队列
│   │   ├── storage.ts            # 兼容导出门面，不含本地业务实现
│   │   └── auth.ts               # Token 管理
│   ├── server/
│   │   ├── apiShared.ts          # API 绑定、鉴权和校验工具
│   │   ├── systemRoutes.ts       # 登录、健康、初始化、备份和设置
│   │   └── database.ts           # D1 查询、聚合、备份和写入语句
│   ├── types/index.ts            # 共享数据契约
│   ├── App.tsx                   # 路由页面组合与交互协调
│   └── main.tsx                  # Router、QueryClient 和 React 入口
├── tests/                        # 当前保留的单元测试
├── wrangler.toml
└── package.json
```

## 当前边界

- 单用户鉴权符合当前使用方式，但不适合多人协作或细粒度授权。
- Bilibili 只保留当前公开指标，不保存历史快照或增长趋势。
- 当前增加了关键字段边界的单元测试，并用本地 D1 验证草稿并发、分页和引用清理；完整组件和端到端覆盖仍需后续补齐。
- 大型业务页面仍可继续按功能域拆小；当前已先收敛数据状态、路由和服务端公共职责。

## 许可

仓库尚未包含独立 `LICENSE` 文件。对外分发或交付前需确认版权归属并补充正式许可证。
