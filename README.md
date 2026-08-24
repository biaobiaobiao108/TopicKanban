# 🎬 选题生产工作台 (Topic Kanban Studio)

面向 Bilibili 人物、网红争议、主播事件和社会纪实类视频创作者的专属生产工作台。系统围绕“下一步最该做什么”，覆盖线索收集、资料核验、故事梳理、文案写作、成片发布与数据复盘。

支持 **本地 Podman / Docker 单容器部署（内置本地 SQLite 与反代适配）** 与 **Cloudflare 边缘部署** 两种模式。

---

## ✨ 核心能力

- **选题生命周期**：`inbox`（收集箱）→ `approved`（已立项）→ `scripting`（写稿中）→ `production`（待制作），以及 `published`（已发布）和 `icebox`（搁置）。
- **今日聚焦**：结合置顶、优先级、阶段和更新时间生成今日工作列表，并提示停滞选题。
- **看板与选题库**：拖拽流转、服务端分页/排序/搜索、标签/人物筛选、全站统一高质感自定义下拉交互 (`CustomSelect`)、快捷建卡、归档和回收站批量处理。
- **选题详情**：概览、5 维故事评分、资料库、时间线、人物档案网和文案工作区。
- **资料分层与智能识别**：区分 `fact`（事实）、`clue`（线索）、`material`（素材），支持一键无弹窗核实轮转与线索升级；内置 **Bilibili / YouTube 智能识别**（自动拉取视频真实标题、UP主/作者、简介与发布日期）。
- **故事时间线与节奏走廊**：精确/模糊时间精度混排；支持打上自由反差与情绪标记（`荒诞反差`、`人物张力`、`高潮爆发` 等），顶部连线呈现水平流动的「叙事反差与情绪节奏走廊 (Rhythm Corridor)」。
- **人物档案网**：维护别名、平台主页、语录、关联选题和人物关系；故事时间线支持关联多个人物。
- **文案编辑与演播气口**：Tiptap 富文本、分段大纲、证据链引用、字数/片长智能换算（默认 280 字/分）；支持快捷插入演播气口标记（`[停顿 1s]`、`[重音]` 等），编辑器内部采用原子胶囊徽章呈现，并在偏好设置中支持自定义管理与 KV 持久化。
- **录音播音提词器**：全屏自适应镜像提词、大纲节点快速锚定跳转、高对比度独立深浅色模式、智能识别高亮演播气口胶囊。
- **文案防丢**：1.5 秒本地恢复缓存；离开或切台即时同步；原子版本号防止并发冲突覆盖。
- **外部审稿快照分享**：支持一键生成免登录只读审稿快照链接（可设 1~30 天 TTL），外部配音/剪辑/画师免密码直接查阅，到期后自动物理销毁。
- **反代公网域名适配 (Public Base URL)**：无论在局域网还是本地写稿，生成的审稿链接与快投接口自动使用反代配置的公网域名。
- **多端在线感知锁**：在写稿界面维持心跳租约（30s TTL），当另一设备打开同选题时顶部弹出防冲突横幅。
- **手机灵感快投箱**：提供极速 Webhook 接口，支持 iOS 快捷指令或手机分享菜单一秒直投碎片文字与链接，顶栏红点提醒并支持一键转入收集箱。
- **发布复盘**：记录 BVID、链接、发布日期、当前播放与互动指标（直连 B站 API）。
- **全量备份与迁移**：支持导出与导入包含全部业务实体的 JSON 备份，以及导出全量 Markdown 文案合辑。

---

## 🏗️ 技术架构

- **前端框架**：React 18、TypeScript、Vite 6、Tailwind CSS 3
- **路由与状态**：React Router 7、TanStack Query 5
- **富文本与交互**：Tiptap 2、`@dnd-kit`
- **服务端**：Hono 4 + Bun 原生 HTTP Server
- **数据库**：
  - **本地模式**：本地 SQLite（`bun:sqlite` + WAL 模式高性能事务）
  - **云端模式**：Cloudflare D1 (SQLite) + Cloudflare Workers KV
- **运行与测试工具链**：Bun（包管理、运行时、构建与 `bun:test`）

```text
创作者浏览器 (Web / Mobile Safari)
  ├─ React Router + TanStack Query
  ├─ LocalStorage（登录 Token、UI 偏好、文案恢复缓存）
  └─ /api/* ──┬─→ [本地容器] Hono Server ──→ 本地 SQLite (kanban.db) & 本地 KV 表
              └─→ [云端边缘] Hono Pages  ──→ Cloudflare D1 & Workers KV
```

---

## 🐳 一、本地 Podman / Docker 容器部署（推荐）

工作台采用**单容器一体化架构（All-in-One Container）**，由 Bun 服务端统一托管前端静态网页与 `/api` 接口，数据保存在挂载目录的单个 `kanban.db` 文件中。

### 1. 快速拉起 (Docker Compose / Podman Compose)

在项目目录下准备 `docker-compose.yml`：

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
      - QUICK_DROP_TOKEN=your_quick_drop_token  # 手机快捷指令独立Token
      - PUBLIC_BASE_URL=https://kanban.yourdomain.com # 反向代理公网域名 (注意：必须包含 https:// 或 http:// 协议前缀，局域网使用可留空)
      - DATA_DIR=/app/data
    volumes:
      - ./data:/app/data
```

启动命令：
```bash
# 方式 A：基于本地源码构建并拉起
docker compose up -d --build
# 或 Podman:
podman compose up -d --build

# 方式 B：直接拉取 GitHub Actions 自动构建好的预编译镜像 (免本地安装依赖与构建)
docker run -d \
  --name topic-kanban \
  --restart unless-stopped \
  -p 3000:3000 \
  -e APP_PASSWORD="your_secure_password" \
  -e QUICK_DROP_TOKEN="your_quick_drop_token" \
  -e PUBLIC_BASE_URL="https://kanban.yourdomain.com" \
  -v ./data:/app/data \
  ghcr.io/biaobiaobiao108/topickanban:latest
```

> ⚠️ **重要提示（关于 `PUBLIC_BASE_URL` 域名前缀）**：
> 配置 `PUBLIC_BASE_URL` 时**必须包含完整的协议前缀**（如 `https://kanban.yourdomain.com` 或 `http://192.168.1.100:3000`），**切勿仅填写裸域名**（如 `kanban.yourdomain.com`）。若缺少协议头，浏览器会将生成的审稿链接解析为相对路径，导致新标签页预览或跳转异常。

访问 `http://localhost:3000` 即可开始使用。

---

### 2. 反向代理（Reverse Proxy）配置

当通过反向代理（Nginx / Caddy / NPM / Cloudflare Tunnel）对外提供服务时，工作台会自动识别 `X-Forwarded-*` 请求头或采用配置的 `PUBLIC_BASE_URL`，确保生成的审稿链接在公网有效。

> 💡 如果您通过反代域名访问，推荐在工作台「偏好设置」->「选题生产流与外部审稿偏好」中填入带协议的公网地址（如 `https://kanban.yourdomain.com`）。

#### Nginx 配置样例：
```nginx
server {
    listen 443 ssl http2;
    server_name kanban.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 10M;

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

更详细的容器化配置请参阅 [docs/CONTAINER_DEPLOY.md](docs/CONTAINER_DEPLOY.md)。

---

## ☁️ 二、Cloudflare Pages 部署流程

如果您希望直接托管在 Cloudflare 边缘网络上，可以通过 Cloudflare 控制台进行无代码环境部署：

### 1. 在 Cloudflare 控制台准备资源
1. **创建 D1 数据库**：
   - 进入 Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database** → 点击 **Create Database**。
   - 数据库命名为 `kanban`。
2. **创建 KV 命名空间**：
   - 进入 Cloudflare Dashboard → **Workers & Pages** → **KV** → 点击 **Create a Namespace**。
   - 命名空间命名为 `kanban-kv`。

### 2. 在 Cloudflare Pages 中绑定变量
1. 将本仓库连接到 **Cloudflare Pages**（或通过 CLI 上传）。
2. 在 Pages 项目的 **Settings** → **Functions** → **Bindings** 中添加：
   - **D1 Database Bindings**：
     - Variable name: `DB`
     - D1 Database: 选择刚才创建的 `kanban`
   - **KV Namespace Bindings**：
     - Variable name: `KV`
     - KV namespace: 选择刚才创建的 `kanban-kv`
   - **Environment Variables (Secrets)**：
     - `APP_PASSWORD`: 设置您的工作台访问密码
     - `QUICK_DROP_TOKEN`: 设置手机快捷指令快投独立 Token

### 3. 初始化远程数据库表结构
使用本地 wrangler CLI 将基础 SQL 导入远程 D1：
```bash
# 执行数据库基线初始化
bunx wrangler d1 execute kanban --remote --file=./drizzle/0000_schema.sql
```

### 4. 构建与发布
- 构建命令：`bun run build`
- 输出目录：`dist`

---

## 💻 三、本地开发工作流

要求：Bun 1.4+。

```bash
# 1. 安装依赖
bun install

# 2. 启动本地开发 (同时启动 Vite 前端 3000 端口与本地 Node 后端 8787 端口)
bun run dev

# 3. 访问 http://localhost:3000
# 本地开发默认口令为：admin (若需自定义可在 .env 中设置 APP_PASSWORD)

# 4. 运行全量测试
bun run test:run

# 5. 生产构建打包 (编译 SPA 前端 + Bundle Bun 服务端)
bun run build

# 6. 生产单机预览运行
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
│   ├── components/                      # 业务功能组件 (kanban/topic-detail/settings/etc.)
│   ├── hooks/useWorkspace.ts            # 工作区查询缓存与实体更新
│   ├── lib/
│   │   ├── publicUrl.ts                 # 反代公网域名推导与规范化
│   │   ├── remoteStorage.ts             # API 数据通信门面
│   │   └── auth.ts                      # 无状态 HMAC Token 鉴权
│   ├── server/
│   │   ├── createApp.ts                 # Hono 核心路由定义 (跨运行时共享)
│   │   ├── server.ts                    # Bun 独立服务端入口 (静态托管 + API)
│   │   ├── database.ts                  # SQL 业务持久层与备份导入导出
│   │   ├── systemRoutes.ts              # 系统、健康检查、设置与备份路由
│   │   └── adapters/
│   │       ├── localSqlite.ts           # 本地 SQLite (bun:sqlite) D1 兼容适配层
│   │       └── localKv.ts               # 本地 SQLite KV 表适配层 (含 TTL 过期支持)
│   ├── types/index.ts                   # 领域模型与 TypeScript 契约
│   ├── App.tsx                          # 主应用路由入口
│   └── main.tsx                         # React DOM 挂载入口
├── tests/                               # bun:test 自动化单元与集成测试套件
├── docs/
│   └── CONTAINER_DEPLOY.md              # 容器部署与反向代理深度配置指南
├── Dockerfile                           # 多阶段构建 Dockerfile
├── docker-compose.yml                   # Docker / Podman 一键编排配置
└── package.json
```

---

## ⌨️ 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `N` | 非输入状态下快速新建选题 |
| `Ctrl / Cmd + P` 或 `/` | 打开全局指令搜索面板 |
| `Esc` | 关闭弹窗或浮层 |
| `Cmd / Ctrl + Shift + F` | 进入文案沉浸专注模式 |
