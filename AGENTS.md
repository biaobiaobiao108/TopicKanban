# TopicKanban Agent 指南

本文件只记录跨任务有效的约束。业务字段、状态和当前实现以源码与数据模型为准；不要在这里复制易变的实现细节。

## 基本约定

- 默认使用中文沟通；优先选择简单、成熟且符合现有代码风格的方案，不为假想需求增加抽象或依赖。
- 用户可见日期、自然日边界和日历运算使用 `Asia/Shanghai`；时间戳存 UTC，时长直接比较 UTC 瞬间。
- Safari 是桌面端优先浏览器。涉及中文输入、剪贴板、视口、滚动、弹窗或 PWA 时检查 Safari；移动端保留 iPhone Safari 和安全区适配。
- JavaScript / TypeScript 的依赖、脚本、构建和测试使用 Bun。
- 未经用户确认，不执行删除关键数据、重置数据库或其他不可逆操作。

## 代码地图

- 前端入口为 `src/main.tsx`、`src/App.tsx`；组件、hooks 和通用逻辑分别位于 `src/components/`、`src/hooks/`、`src/lib/`。
- 领域类型位于 `src/types/`；服务端入口与装配位于 `src/server/app.ts`，请求校验、路由和 SQL 仓储分别位于 `src/server/schemas.ts`、`src/server/routes/`、`src/server/repositories/`。
- `database/schema.sql` 是数据库基线；`tests/` 存放测试；`docs/API.md` 是 API 说明。
- 根目录 `index.html` 是主应用入口；`docs/index.html` 是独立静态展示页。

## 验证与提交

- 每次提交包含应用代码、服务端代码、脚本、测试、依赖或构建配置改动时，提交前按顺序完成以下步骤：

  1. 运行 `bun run format`，格式化范围以 `package.json` 中的脚本为准。
  2. 检查格式化产生的 diff，确认没有无关改动，并运行 `git diff --check`。
  3. 依次运行 `bun run typecheck`、`bun run test` 和 `bun run build`；测试脚本使用 `bun test --check`。

- 上述检查全部通过后才能提交；代码再次改动后，从格式化开始重新执行完整流程，任一检查失败须先修复。
- 每个完成的代码改动集都必须自动创建中文本地 Git 提交，包括重构、维护和小修复；以完整任务为单位，不按文件或中间步骤零碎提交。提交标题使用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 或 `ci:` 前缀，并用中文描述。
- 纯文档修改可跳过上述代码检查，仍须检查 diff 并运行 `git diff --check`。
- 本地无需构建 Docker 镜像，由 CI 负责。
- 只提交本次任务的改动，不混入已有的无关修改；未经明确要求，不自动推送或发布。

## 项目边界

- 本项目是视频创作者选题看板。领域状态、字段和 API 契约以 `src/types/`、`src/server/schemas.ts` 与数据库结构为准。
- 运行环境为 Bun + SQLite。浏览器偏好存 `localStorage`；快投箱存 SQLite，按现有保留期限和容量清理；在线编辑租约只在进程内存中维护。
- `database/schema.sql` 是当前 v1 数据库基线；首次部署前本地数据库可丢弃。首次部署后每次增加 schema 版本都提供连续、事务化的迁移；失败须回滚，不要求用户重建业务数据库。
- 后端分层：`app.ts` 负责组装、中间件和路由注册；`routes/` 负责解析、校验与 HTTP 响应，不写 SQL；`schemas.ts` 集中请求校验；`repositories/` 负责 SQL、事务及关联数据。业务变更按边界同步更新相关路由、repository 和测试；基础设施不反向依赖业务层。
- 删除选题、清空回收站或超期清理使用 SQL `DELETE`，日常删除不得自动 `VACUUM`；仅用户主动整理时执行 `VACUUM`。GET 保持只读，过期恢复失败不得顺带物理删除。
- 国内视频与社交平台链接解析只在客户端通过 `src/lib/clientUrlParser.ts` 执行，禁止服务端代理抓取。
- 快投 Webhook 公网地址优先级为 `PUBLIC_BASE_URL`、可信 `X-Forwarded-*`、浏览器当前 origin。
- 生产容器保持 Dockerfile 默认 root 用户；不要在 Dockerfile、Compose 或 workflow 中改写容器用户。

## 前端约定

- 延续现有文人笔记视觉系统：使用语义设计变量和状态色，避免原始调色板硬编码、嵌套方框和高饱和 KPI；中文正文用无衬线字体，等宽字体只用于代码、URL、时间码等内容。
- 统一使用项目组件：`CustomSelect`、`DateInput`、`FloatingMenu`、`Modal` / `ConfirmDialog`、`useToast` 和 `FloatingScrollbar`。菜单与模态框通过 Portal；使用 `aria-label`，不新增原生 `title` 提示或浏览器弹窗。
- 导航标签宽度保持稳定；列表异步操作只影响目标项。快捷键不应在输入或可编辑内容中误触发，维持现有全局快捷键契约。
- 保留编辑器本地暂存、云端自动保存、防冲突和失败重试行为，避免静默丢稿。
- 查询只订阅当前活跃视图；模块缓存设容量或时限，登出与 401 时清理；避免重复加载同一数据和 N+1 查询。
- 编辑时同步相关缓存并由服务端结果校正；删除时同步移除缓存并更新分页。统计与筛选依赖查询失效和服务端刷新，不在客户端猜算。

## 常用命令

- 开发：`bun run dev`；格式化：`bun run format`；格式检查：`bun run format:check`；类型检查：`bun run typecheck`；测试：`bun run test`；构建：`bun run build`。
- 单机生产运行：`bun run start`；容器按仓库现有 Podman / Docker 配置运行。
- `docs/index.html` 是独立静态展示页，保持零构建；主应用入口仍是根目录 `index.html`。
