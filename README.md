# 🎬 选题生产工作台 (Topic Kanban Studio)

面向 **Bilibili 叙事类视频（互联网人物、网红主播、荒诞事件、社会纪实）** 创作者量身打造的专属选题与文案生产工作台。

系统围绕**「下一步最该做什么（Next Action）」**与**「起承转合叙事引擎」**，全流程覆盖线索收集、一手资料核验、故事时间线梳理、选题排期、商单履约、四幕大纲提炼、分段文案写作、演播提词录制、成片发布与 5D 深度复盘。

* 🌐 **在线产品展示与交互沙盒**：[https://biaobiaobiao108.github.io/TopicKanban/](https://biaobiaobiao108.github.io/TopicKanban/)
* 📦 **开源官方仓库**：[https://github.com/biaobiaobiao108/TopicKanban](https://github.com/biaobiaobiao108/TopicKanban)

支持 **本地 Podman / Docker 单容器一体化部署（Bun 原生服务 + SQLite + 反代适配）**，数据与运行时均由单个 Bun 服务统一管理。

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

### 8. 💼 商单中心与履约管理 (Commercial Deals)
* **商务线索统一收口**：记录品牌方、代理商、对接人、联系方式、商单来源与交付类型，支持从沟通线索逐步推进到正式制作。
* **阶段与履约追踪**：覆盖「沟通中 → 制作中 → 已交付 → 归档」流程，单独管理合同状态、成交金额、交付截止日、计划上线日和回款状态。
* **商单驾驶舱**：集中查看进行中的商单、7 天内交付/已逾期事项、待补下一步和未回款金额，支持关键词、阶段、回款状态筛选及分页。
* **商务与内容联动**：商单可绑定主选题、关联发布视频，并在详情中维护沟通/阶段/回款活动记录；必要时可从商单直接创建选题。

### 9. 🗓️ 选题日历与制作排期 (Editorial Calendar)
* **三种排期视图**：提供月视图、周视图与日程流，按日期集中查看选题、交付和发片安排。
* **多图层生产节奏**：可独立开关计划发片、制作截止、商单履约、已发布视频和推迟唤醒 5 类事项，月度统计同步展示计划发片、商单履约与已发视频数量。
* **拖拽定档**：将待排期选题直接拖到日历日期即可写入计划发片日；也可在指定日期快速新建选题并设置计划发片日与制作截止日。
* **跨模块跳转**：日历中的选题、商单和已发布视频都可直接打开详情，商单交付日、选题截止日与下一步唤醒日集中呈现，适合做周计划与发片排程。

### 10. 📊 已发布视频复盘与 5D 数据罗盘 (Published Analytics)
* **成片指标追踪**：记录 BVID 与成片链接，一键同步 B 站最新播放量、弹幕、评论、点赞、投币、收藏与分享数据。
* **深度复盘罗盘**：自动生成 5D 故事评估与成片播放量的关联双柱图，智能提炼爆款选题的决定性因子。

### 11. 🎨 温润编辑部设计系统与主题生态 (Editorial Design System)
* **温润微质感**：基于 Stone 灰度与 Rose 玫瑰红强调色打造，采用大圆角（`rounded-2xl`）、微投影（`shadow-2xs`）与透底色药丸（Tinted Pills）。
* **5 套温润编辑部主题随心换**：北欧冷杉（推荐）、暖沙纸境、经典浅色、深色夜间、跟随系统。
* **全局指令搜索面板 (`Cmd/Ctrl + /` 或 `/`)**：支持全拼搜索，并通过 `#` 查赛道、`@` 查人物、`>` 执行快捷动作、`?` 调出快捷键大全。

### 12. ⚡ Bun-first 运行时规范

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
| **前端核心** | React 19 + TypeScript + Bun HTML Bundler + Tailwind（`bun-plugin-tailwind@0.1.2`） | 模块化 SPA，Bun 热重载与同源开发 |
| **路由与动效** | React Router 7 + View Transitions API + TanStack Query 5 | 平滑视图过渡、服务端状态缓存与乐观更新 |
| **富文本编辑** | Tiptap 3 (`3.31.3`) + StarterKit + 自定义原子气口扩展 | 支持演播气口节点与字数计算 |
| **看板与拖拽** | `@dnd-kit/core` + `@dnd-kit/sortable` | 丝滑拖拽流转与时序排序 |
| **服务端与校验** | Bun 原生 HTTP Server + Zod 4 声明式校验管道 + 按领域组织的原生路由 | `app.ts` 负责组合，`schemas.ts` 统一契约校验，`routes/` 负责 HTTP 行为，`repositories/` 负责 SQLite 持久化 |
| **主业务持久库** | SQLite (`bun:sqlite` + WAL) | 选题、素材、时间线、人物、文案、发布包、商单等业务表 |
| **键值与临时库** | SQLite `_kv_store` 表 | 全局偏好、审稿快照、在线锁、快投箱 |
| **测试与构建** | Bun (`bun test` + `Bun.build()`) | 124 项全量测试，前后端统一构建 |

---

## 🌐 线上交互展示页 (GitHub Pages)

项目在 `docs/` 目录下内置了现代化的单文件静态产品落地页，包含全套 **5D 故事评估罗盘实时拖拽沙盒、起承转合四幕流水线、演播录音提词器模拟器与 3D 鼠标倾斜动效**。

* **线上地址**：[https://biaobiaobiao108.github.io/TopicKanban/](https://biaobiaobiao108.github.io/TopicKanban/)
* **部署方式**：GitHub 仓库设置中直接开启 GitHub Pages，选择 `master` (或 `main`) 分支的 `/docs` 目录即可秒级自动上线。

---

## 🐳 一、本地 Podman / Docker 一体化容器部署（推荐）

工作台采用**单容器一体化架构（All-in-One Container）**，由 Bun 服务端统一托管前端编译资产与 `/api` 接口，全部数据保存在挂载目录的单个 `kanban.db` 文件中。

### 1. 使用 Docker Compose / Podman Compose

项目已提供 `docker-compose.yml`。首次启动前，请在项目根目录创建 `.env`，至少设置一个强密码：

```dotenv
APP_PASSWORD=your_secure_password
QUICK_DROP_TOKEN=your_quick_drop_token
PUBLIC_BASE_URL=https://kanban.yourdomain.com
TRUST_PROXY_HEADERS=false
```

然后使用以下 Compose 配置：

```yaml
services:
  kanban:
    build: .
    image: topic-kanban:latest
    container_name: topic-kanban
    restart: unless-stopped
    ports:
      - "3030:3030"
    environment:
      NODE_ENV: production
      PORT: "3030"
      APP_PASSWORD: ${APP_PASSWORD:?APP_PASSWORD is required}
      QUICK_DROP_TOKEN: ${QUICK_DROP_TOKEN:-}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-}
      TRUST_PROXY_HEADERS: ${TRUST_PROXY_HEADERS:-false}
      DATA_DIR: /app/data
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

访问 `http://localhost:3030` 即可开始使用。容器不会使用默认生产密码，`APP_PASSWORD` 必须在 `.env` 或环境变量中显式设置。

---

### 2. 反向代理（Reverse Proxy）配置

当容器部署在 Nginx / Caddy / NPM 等反向代理后方时，建议配置 `PUBLIC_BASE_URL`。只有在代理会可靠覆盖并转发 `X-Forwarded-*` 请求头时，才显式设置 `TRUST_PROXY_HEADERS=true`；默认关闭可避免伪造请求头影响登录限流或分享链接域名。

#### Nginx 配置样例：
```nginx
server {
    listen 443 ssl http2;
    server_name kanban.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3030;
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
    reverse_proxy 127.0.0.1:3030
}
```

详细容器化部署说明请参阅 [docs/CONTAINER_DEPLOY.md](docs/CONTAINER_DEPLOY.md)。

---

## 📱 三、手机 PWA 安装（iOS + Android）

主应用支持通过 PWA 安装到手机主屏幕。生产环境请使用 HTTPS；`localhost` 和 `127.0.0.1` 仅适合本地测试，普通局域网 HTTP 地址无法获得完整 PWA 安装能力。

### Android

使用最新版 Chrome、Edge 或 Samsung Internet 打开工作台，点击页面中的「安装到手机」；如果浏览器没有自动提示，则打开浏览器菜单，选择「安装应用」或「添加到主屏幕」。

### iOS / iPadOS

使用 Safari（或支持添加到主屏幕的浏览器）打开工作台，点击分享按钮 →「添加到主屏幕」→「添加」。从主屏幕图标打开后，工作台会以独立 App 窗口运行。

PWA 会缓存应用壳与静态资源，断网时可以启动已缓存的界面；业务数据和普通新增、编辑操作仍需要连接工作台服务器。文案编辑器已有本地草稿暂存，可继续保护尚未同步的文案。

---

## 💻 四、本地开发与验证工作流

系统推荐使用 **Bun 1.4+** 进行依赖管理与开发测试：

前端使用 Bun HTML Bundler 与 Bun.serve；Tailwind 通过 `bun-plugin-tailwind@0.1.2` 处理，插件内置 Tailwind `4.1.14`。

```bash
# 1. 安装依赖
bun install

# 2. 启动本地全栈开发环境 (Bun HTML Bundler + Bun API，3030 端口)
bun run dev

# 3. 运行全量自动化测试套件 (114 项单元与集成测试)
bun run test:run

# 4. 运行 Playwright E2E（Playwright CLI 使用 Bun 运行时）
bun run test:e2e

# 5. 生产构建打包 (Bun HTML Bundler 全栈 Bundle)
bun run build

# 6. 本地生产单机运行
bun run start
```

---

## 🗂️ 目录结构

```text
kanban/
├── .github/
│   └── workflows/
│       ├── ci.yml                       # 主分支自动化测试、类型检查、构建与体积预算门禁
│       └── docker-publish.yml           # 版本发布多架构 Docker 镜像自动打包与推送
├── drizzle/
│   └── 0000_schema.sql                  # 当前完整数据库基线表结构 SQL
├── src/
│   ├── components/
│   │   ├── auth/                        # 登录鉴权组件
│   │   ├── calendar/                    # 选题日历、月/周/日程流与拖拽排期
│   │   ├── deals/                       # 商单中心、履约、回款与沟通记录
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
│   │   ├── theme.ts                     # 5 套温润编辑部主题调色板配置
│   │   └── auth.ts                      # Web Crypto HMAC-SHA256 Token 鉴权
│   ├── server/
│   │   ├── app.ts                       # API 应用组合与鉴权中间件
│   │   ├── server.ts                    # Bun 独立服务端入口 (静态托管 + API)
│   │   ├── native.ts                    # Bun 原生请求上下文与路由适配
│   │   ├── sqlite.ts                    # bun:sqlite 数据库封装
│   │   ├── appKv.ts                     # SQLite KV 与 TTL 存储
│   │   ├── apiShared.ts                 # API 常量、校验、Token 与通用辅助
│   │   ├── routes/                      # 按业务领域组织的 REST 路由注册模块
│   │   │   ├── topics.ts                # 选题、回收站与今日聚焦
│   │   │   ├── workspace.ts             # 工作区、素材与时间线
│   │   │   ├── writing.ts               # 草稿、发布包与引用
│   │   │   ├── people.ts                # 人物与关系
│   │   │   ├── tags.ts                  # 标签
│   │   │   ├── published.ts             # 已发布视频与分析
│   │   │   ├── deals.ts                 # 商单与履约记录
│   │   │   ├── sharing.ts               # 审稿分享与在线锁
│   │   │   ├── quickDrops.ts            # 快投灵感
│   │   │   └── system.ts                # 鉴权、健康检查、设置与备份
│   │   └── repositories/                # 按业务领域组织的 SQLite 查询与写入
│   │       ├── topics.ts                # 选题查询与写入
│   │       ├── workspace.ts             # 工作区、素材与时间线持久化
│   │       ├── writing.ts               # 草稿、发布包与引用持久化
│   │       ├── people.ts                # 人物与关系持久化
│   │       ├── tags.ts                  # 标签持久化
│   │       ├── published.ts             # 已发布视频与分析查询
│   │       ├── deals.ts                 # 商单持久化
│   │       ├── bootstrap.ts             # 启动数据聚合
│   │       ├── backup.ts                # 备份导入导出
│   │       ├── system.ts                # 系统数据库探测
│   │       ├── shared.ts                # SQL bind 与共享数据库辅助
│   │       └── index.ts                 # repository 统一导出
│   ├── types/index.ts                   # 领域模型与 TypeScript 契约
│   ├── App.tsx                          # 路由分发入口
│   └── main.tsx                         # DOM 挂载入口
├── tests/                               # 114 项 bun:test 自动化单元与集成测试套件
├── docs/                                # GitHub Pages 静态展示落地页与文档
│   ├── index.html                       # 独立产品落地页 (含交互沙盒与现代化动画)
│   ├── icon.png                         # 落地页高清应用图标
│   ├── apple-touch-icon.png             # 触控图标
│   ├── .nojekyll                        # 禁用 Jekyll 静态过滤
│   └── CONTAINER_DEPLOY.md              # 容器化部署说明文档
├── docker-compose.yml                   # 一键容器编排配置
└── package.json
```

---

## ⌨️ 常用快捷键速查

| 快捷键 | 作用场景 | 功能说明 |
| :--- | :--- | :--- |
| `Ctrl / Cmd + /` 或 `/` | 全局任意界面 | 打开全局指令搜索面板（支持 `#` 赛道、`@` 人物、`>` 动作、`?` 快捷键） |
| `N` | 看板或非输入状态 | 快速呼出 10 秒新建选题弹窗 |
| `Esc` | 任意弹窗 / 浮层 | 快速关闭当前弹窗、抽屉或退出专注模式 |
| `Cmd / Ctrl + Shift + F` | 文案编辑器中 | 一键开启 / 退出文案全屏沉浸专注模式 |
| `Cmd / Ctrl + Shift + P` | 文案编辑器中 | 一键开启高对比度全屏录音播音提词器 |

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
