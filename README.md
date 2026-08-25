# 🎬 选题生产工作台 (Topic Kanban Studio)

面向 **Bilibili 叙事类视频（互联网人物、网红主播、荒诞事件、社会纪实）** 创作者量身打造的专属选题与文案生产工作台。

系统围绕**「下一步最该做什么（Next Action）」**与**「起承转合叙事引擎」**，全流程覆盖线索收集、一手资料核验、故事时间线梳理、四幕大纲提炼、分段文案写作、演播提词录制、成片发布与 5D 深度复盘。

支持 **本地 Podman / Docker 单容器一体化部署（内置 SQLite 与反代适配）** 与 **Cloudflare 边缘网络部署** 双环境无缝切换。

---

## ✨ 核心能力与工作流体系

### 1. 🚀 下一步行动治理 (Next Action Engine)
* **行动聚焦与抗拖延**：每个选题必须明确当前唯一最该推进的具体动作，消除多选题切换时的选择焦虑。
* **智能推迟与自动唤醒**：支持「稍后/今日稍后/明日再议」推迟处理，采用北京时间（UTC+8）跨天自动解除推迟状态。
* **停滞预警**：在「偏好设置」中支持配置停滞阈值（3天/5天/7天），超期未更新行动的选题在今日聚焦与看板中醒目标红预警。

### 2. 🧭 起承转合四幕叙事蓝图与 5D 诊断罗盘 (Story Engine & Diagnostic Dial)
* **四幕叙事结构化蓝图**：
  * 提炼 **黄金 3 秒 Hook**、**为什么是现在 (Why Now)** 与 **核心一句话 Pitch**；
  * 内置 **【起·破题引人】、【承·反转升级】、【转·荒诞高潮】、【合·价值落地】** 四幕卡片结构，支持与原始 Markdown 文本一秒无损双向切换，800ms 防抖实时自动暂存。
* **叙事流水线一键贯通**：
  * **注入文案区**：一键将四幕大纲作为分段 H2 标题自动注入正文草稿区；
  * **沉淀时间线**：一键将四幕核心转折点转化为故事时间线关键事件。
* **5 维故事健康度罗盘**：
  * 人物张力、戏剧冲突、荒诞反差、素材完整度、主线成立度 5 维诊断；
  * 自动计算综合故事力（0~100 分），智能定位内容短板并支持**一键生成针对性的下一步行动**。

### 3. 📑 资料素材 3 级分层与客户端直连解析
* **资料严格 3 级分层**：清晰划分 `fact`（已核实事实）、`clue`（待考证线索）、`material`（背景素材），支持一键无弹窗核实状态轮转与线索升级。
* **客户端原生直连解析 (Zero Server Scraping)**：
  * **Bilibili**：客户端原生 JSONP 直连 B 站开放 API，零风控、毫秒级获取视频真实标题、UP主/作者、简介、发布日期、封面及播放/点赞/投币/收藏等全套互动数据；
  * **YouTube**：客户端官方 oEmbed CORS 直连拉取标题、作者与封面；
  * **抖音 / 快手 / 小红书 / 微博 / 微信 / 知乎**：内置语义智能提取器，自动剥离移动端 App 复制口令与分享尾缀，精准提取作者、纯净标题与内容摘要。

### 4. ⏳ 故事时间线与叙事节奏走廊 (Timeline & Rhythm Corridor)
* **时序与自定义混排**：支持精确（年/月/日）与模糊时间精度（年/月、年份、待考证）；支持拖拽自由排序与一键时间从新到旧/从旧到新排列。
* **叙事反差打标**：为关键转折打上反差标签（`荒诞反差`、`人物张力`、`高潮爆发` 等），顶部以水平流动连线呈现「叙事反差与情绪节奏走廊」。

### 5. 👥 人物档案与网状关系库 (People Archive & Relations)
* **独立人物库**：维护网红与当事人别名外号、核心人设标签、平台主页、粉丝量、经典语录与背景简介。
* **人物关系网**：支持定义人物间双向/网状关联（合作、对立、背叛、师徒、师友等），在选题内自动关联出场人物关系。

### 6. ✍️ 沉浸写稿工作台、演播气口与录音提词器 (Studio & Teleprompter)
* **Tiptap 富文本编辑器**：支持大纲目录、实时字数统计与片长换算（默认 280 字/分钟，可自由调节 180~420 字/分）。
* **演播气口标记库 (Voiceover Cues)**：
  * 支持快捷插入配音提示词（`[停顿 1s]`、`[重音]`、`[反讽语气]` 等），编辑器内以原子胶囊徽章呈现，并在设置中支持自定义增删与 KV 持久化。
* **高对比度录音提词器 (`Cmd/Ctrl + Shift + P`)**：
  * 支持全屏自适应镜像翻转、可调滚动语速、大纲锚点跳转；
  * 自动将演播气口渲染为醒目导播指示灯，录音读错率直降。
* **文案专注模式 (`Cmd/Ctrl + Shift + F`)**：纯净无干扰全屏写作，支持打字机居中模式。
* **三重文案防丢保障**：1.5 秒本地防抖缓存，切台/页面隐藏即时同步，携带 `base_version` 原子校验防并发覆盖。

### 7. 📤 外部免密审稿快照与多端协作
* **免登录审稿链接**：一键生成只读审稿快照（支持设置 1/3/7/30 天 TTL），外部配音/剪辑/画师无需密码直接查阅，到期后物理自动销毁。
* **多端编辑在线感知防踩踏**：写稿维持 30s TTL 租约心跳，当其他设备同时打开同选题时顶部弹出防冲突横幅。
* **手机快捷指令碎片快投箱**：提供独立 Webhook 接口与独立 Token，刷手机时通过 iOS 快捷指令一秒直投碎片灵感，工作台顶栏红点提示并支持一键转为收集箱选题。

### 8. 📊 已发布视频复盘与 5D 数据罗盘 (Published Analytics)
* **成片指标追踪**：记录 BVID 与成片链接，一键同步 B 站最新播放量、弹幕、评论、点赞、投币、收藏与分享数据。
* **深度复盘罗盘**：自动生成 5D 故事评估与成片播放量的关联双柱图，智能提炼爆款选题的决定性因子。

### 9. 🎨 温润编辑部设计系统与主题生态 (Editorial Design System)
* **温润微质感**：基于 Stone 灰度与 Rose 玫瑰红强调色打造，采用大圆角（`rounded-2xl`）、微投影（`shadow-2xs`）与透底色药丸（Tinted Pills）。
* **8 套主题随心换**：北欧冷杉（推荐）、巴黎晨光、深海星图（极客夜间）、京都茶席、暖沙纸境、经典浅色、深色专注、跟随系统。
* **全局指令搜索面板 (`Cmd/Ctrl + P` 或 `/`)**：支持全拼搜索，并通过 `#` 查赛道、`@` 查人物、`>` 执行快捷动作、`?` 调出快捷键大全。

### 10. ⚡ Bun-first 运行时规范

本项目本地开发、依赖管理、测试、构建和 CLI 工具统一优先使用 Bun。只要 Bun 已经支持对应工具，就不要改用 Node.js、npm 或 npx。

对于带有 Node.js shebang 的 CLI（例如 Playwright），必须显式使用 Bun 运行：

```bash
bun run --bun playwright test
```

项目的 E2E 快捷命令已内置该设置，因此直接执行下面的命令也会让 Playwright CLI 使用 Bun 运行时：

```bash
bun run test:e2e
```

只有工具明确不兼容 Bun 时，才允许退回 Node.js，并应在相关文档或脚本中说明原因。

---

## 🛠️ 技术架构

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端核心** | React 18 + TypeScript + Vite 6 + TailwindCSS 3 | 模块化 SPA，秒级热重载 |
| **路由与状态** | React Router 7 + TanStack Query 5 | 服务端状态缓存与乐观更新 |
| **富文本编辑** | Tiptap 2 + StarterKit + 自定义原子气口扩展 | 支持演播气口节点与字数计算 |
| **看板与拖拽** | `@dnd-kit/core` + `@dnd-kit/sortable` | 丝滑拖拽流转与时序排序 |
| **服务端** | Hono 4 + Bun 原生 HTTP Server | 跨运行时统一路由，启动 < 30ms |
| **主业务持久库** | 本地 SQLite (`bun:sqlite` + WAL) / Cloudflare D1 | 8 张强关系型业务核心表 |
| **键值与临时库** | 本地 `_kv_store` 表 (`LocalKVNamespace`) / Cloudflare KV | 全局偏好、审稿快照、在线锁、快投箱 |
| **测试与构建** | Bun (`bun test` + `bun build`) | 54 项全量测试，毫秒级运行 |

---

## 🐳 一、本地 Podman / Docker 一体化容器部署（推荐）

工作台采用**单容器一体化架构（All-in-One Container）**，由 Bun 服务端统一托管前端编译资产与 `/api` 接口，全部数据保存在挂载目录的单个 `kanban.db` 文件中。

### 1. 使用 Docker Compose / Podman Compose

在项目根目录创建 `docker-compose.yml`：

```yaml
services:
  kanban:
    build: .
    image: topic-kanban:latest
    container_name: topic-kanban
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - APP_PASSWORD=your_secure_password      # 工作台访问密码
      - QUICK_DROP_TOKEN=your_quick_drop_token  # 手机快捷指令快投独立 Token
      - PUBLIC_BASE_URL=https://kanban.yourdomain.com # 反向代理公网域名（包含 https:// 协议头）
      - DATA_DIR=/app/data
    volumes:
      - ./data:/app/data
```

启动命令：
```bash
# 本地构建并拉起容器服务
docker compose up -d --build
# 或使用 Podman:
podman compose up -d --build
```

访问 `http://localhost:3000` 即可开始使用。本地开发与容器默认密码为 `admin`（可通过 `APP_PASSWORD` 自定义）。

---

### 2. 反向代理（Reverse Proxy）配置

当容器部署在 Nginx / Caddy / NPM / Cloudflare Tunnel 后方时，工作台会自动识别 `X-Forwarded-*` 请求头或采用配置的 `PUBLIC_BASE_URL`，确保生成的审稿链接与快投接口在公网环境完美访问。

#### Nginx 配置样例：
```nginx
server {
    listen 443 ssl http2;
    server_name kanban.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

#### Caddy 配置样例：
```caddyfile
kanban.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

详细容器化部署说明请参阅 [docs/CONTAINER_DEPLOY.md](docs/CONTAINER_DEPLOY.md)。

---

## ☁️ 二、Cloudflare Pages 部署流程

如果您希望直接托管在 Cloudflare 全球边缘网络上：

### 1. 准备 Cloudflare 资源
1. **创建 D1 数据库**：进入 Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** → 点击 **Create Database**，命名为 `kanban`。
2. **创建 KV 命名空间**：进入 Cloudflare Dashboard → **Workers & Pages** → **KV** → 点击 **Create a Namespace**，命名为 `kanban-kv`。

### 2. 绑定 Pages 项目环境变量
在 Cloudflare Pages 项目的 **Settings** → **Functions** → **Bindings** 中绑定：
* **D1 Database Bindings**：变量名 `DB` → 绑定刚才创建的 `kanban` 数据库；
* **KV Namespace Bindings**：变量名 `KV` → 绑定刚才创建的 `kanban-kv` 命名空间；
* **Environment Variables**：
  * `APP_PASSWORD`: 设置工作台访问密码；
  * `QUICK_DROP_TOKEN`: 设置手机快捷指令快投独立 Token。

### 3. 初始化远程数据库表结构
```bash
bunx wrangler d1 execute kanban --remote --file=./drizzle/0000_schema.sql
```

### 4. 构建与发布
* 构建命令：`bun run build`
* 输出目录：`dist`

---

## 💻 三、本地开发与验证工作流

系统推荐使用 **Bun 1.4+** 进行依赖管理与开发测试：

```bash
# 1. 安装依赖
bun install

# 2. 启动本地全栈开发环境 (Vite 前端 3000 端口 + Bun API 8787 端口)
bun run dev

# 3. 运行全量自动化测试套件 (54 项单元与集成测试)
bun run test:run

# 4. 运行 Playwright E2E（Playwright CLI 使用 Bun 运行时）
bun run test:e2e

# 5. 生产构建打包 (Vite 前端打包 + Bun 服务端 Bundle)
bun run build

# 6. 本地生产单机运行
bun run start
```

---

## 🗂️ 目录结构

```text
kanban/
├── drizzle/
│   ├── 0000_schema.sql                  # 数据库基线表结构 SQL
│   └── 0001_optional_published_topic.sql # 结构升级迁移 SQL
├── functions/api/[[route]].ts           # Cloudflare Pages Functions API 入口
├── src/
│   ├── components/
│   │   ├── auth/                        # 登录鉴权组件
│   │   ├── inbox/                       # 灵感快投抽屉组件
│   │   ├── layout/                      # 顶栏、侧边栏、全局指令面板、快速新建弹窗
│   │   ├── people/                      # 人物档案库与关系网组件
│   │   ├── published/                   # 已发布视频复盘与 5D 分析罗盘
│   │   ├── settings/                    # 偏好设置、排版预览、演播气口库与存储探测
│   │   ├── tags/                        # 标签与赛道沉淀视图
│   │   ├── today/                       # 今日聚焦与停滞推进看板
│   │   ├── topic-detail/                # 选题详情（起承转合蓝图、5D罗盘、素材库、时间线、人物网、写稿区、提词器）
│   │   ├── topic-list/                  # 选题全景看板与数据表格视图
│   │   └── ui/                          # CustomSelect、Modal、Badge、ConfirmDialog
│   ├── hooks/useWorkspace.ts            # 全局工作区查询缓存与乐观更新
│   ├── lib/
│   │   ├── clientUrlParser.ts           # 全站客户端直连解析（Bilibili JSONP / YouTube CORS）
│   │   ├── publicUrl.ts                 # 反代公网域名推导与规范化
│   │   ├── remoteStorage.ts             # REST API 通信门面
│   │   ├── theme.ts                     # 8 套温润编辑部主题调色板配置
│   │   └── auth.ts                      # Web Crypto HMAC-SHA256 Token 鉴权
│   ├── server/
│   │   ├── createApp.ts                 # Hono 核心 REST API 路由定义 (跨运行时共享)
│   │   ├── server.ts                    # Bun 独立服务端入口 (静态托管 + API)
│   │   ├── database.ts                  # SQL 业务持久层与备份导入导出
│   │   ├── systemRoutes.ts              # 系统探测、设置与备份路由
│   │   └── adapters/
│   │       ├── localSqlite.ts           # 本地 SQLite (bun:sqlite) D1 兼容适配层
│   │       └── localKv.ts               # 本地 SQLite KV 表适配层 (含 TTL 过期支持)
│   ├── types/index.ts                   # 领域模型与 TypeScript 契约
│   ├── App.tsx                          # 路由分发入口
│   └── main.tsx                         # DOM 挂载入口
├── tests/                               # 54 项 bun:test 自动化单元与集成测试套件
├── docs/                                # 部署配置与反代说明文档
├── Dockerfile                           # 多阶段构建 Dockerfile
├── docker-compose.yml                   # 一键容器编排配置
└── package.json
```

---

## ⌨️ 常用快捷键速查

| 快捷键 | 作用场景 | 功能说明 |
| :--- | :--- | :--- |
| `Ctrl / Cmd + P` 或 `/` | 全局任意界面 | 打开全局指令搜索面板（支持 `#` 赛道、`@` 人物、`>` 动作、`?` 快捷键） |
| `N` | 看板或非输入状态 | 快速呼出 10 秒新建选题弹窗 |
| `Esc` | 任意弹窗 / 浮层 | 快速关闭当前弹窗、抽屉或退出专注模式 |
| `Cmd / Ctrl + Shift + F` | 文案编辑器中 | 一键开启 / 退出文案全屏沉浸专注模式 |
| `Cmd / Ctrl + Shift + P` | 文案编辑器中 | 一键开启高对比度全屏录音播音提词器 |

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
