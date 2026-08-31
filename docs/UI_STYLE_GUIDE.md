# 前端 UI 风格指南

> 版本：1.0 · 适用范围：本项目所有前端页面、组件和交互

这是一套面向开发者的可执行 UI 规范。目标不是复制某一个页面，而是让新页面在不同业务场景下仍然保持一致的“温润编辑部”视觉：明亮、克制、清晰，有轻微质感，但不喧宾夺主。

本文档中的“必须”表示不可偏离的约束；“推荐”表示默认方案，确有业务理由时可以调整，但应保持同一视觉语义。

## 1. 设计定位

### 1.1 核心气质

- **温润编辑部**：使用 Stone 灰阶、柔和表面、轻边框和低强度阴影，像一张干净的编辑桌面。
- **信息优先**：标题、行动、状态和主要数据必须先于装饰元素被看见。
- **轻质感**：通过圆角、留白、透明色和微妙悬停建立层级；避免厚重阴影、强渐变、发光边框和大面积纯色。
- **可持续工作**：界面要适合长时间使用。正文对比度、字号、行高和移动端触控优先于视觉炫技。

### 1.2 必须遵守

1. 新页面必须沿用现有语义色、字体栈、圆角和阴影体系。
2. 主题切换只改变颜色和氛围，不改变布局、信息层级和交互行为。
3. 组件优先复用现有公共组件和 Tailwind 令牌，不在局部创建一套相似但不同的视觉值。
4. 颜色不能成为传达状态的唯一方式；危险、逾期、错误和完成状态还必须有文字或图标。
5. 桌面和 390px 移动视口都必须可用，不允许横向滚动来弥补布局问题。

## 2. 设计令牌

### 2.1 基础色

默认浅色主题使用以下颜色。使用 Tailwind 时优先使用语义化的 `stone-*`、`rose-*`、`emerald-*`、`amber-*` 等类；使用其他 CSS 框架时建立等价的设计令牌。

| 语义 | 默认值 | 用途 |
| --- | --- | --- |
| 工作区背景 | `#fafaf9` | 页面画布、内容区背景 |
| 表面 | `#ffffff` | 卡片、侧栏、弹窗、输入控件 |
| 主文字 | `#1c1917` | 标题、正文、重要数据 |
| 次文字 | `#78716c` | 辅助说明、元信息、未激活状态 |
| 弱边框 | `#e7e5e4` | 卡片边框、分隔线、控件边框 |
| 品牌浅色 | `#fff1f2` | Rose 强调区域的浅色背景 |
| 品牌主色 | `#e11d48` | 主按钮、激活状态、主要行动 |
| 品牌深色 | `#be123c` | 悬停、深色文字或高强调场景 |
| 成功 | Emerald | 已确认、已完成、已上线 |
| 警告 | Amber | 待核实、临近截止、需要注意 |
| 危险 | Rose / Red | 逾期、错误、删除或破坏性操作 |
| 信息 | Indigo / Sky | 辅助信息、写作中、技术提示 |

深色主题的基础令牌为：工作区 `#0c0a09`、表面 `#1c1917`、主文字 `#f5f5f4`、次文字 `#a8a29e`、边框 `#292524`。深色表面仍需和背景形成层级，不要把所有区域都设成同一个黑色。

### 2.2 主题映射

主题应保留相同的语义角色，而不是让每个主题重新定义组件。下表是当前项目的可见主色参考：

| 主题 | 工作区背景 | 表面 | 主强调色 | 辅助强调色 |
| --- | --- | --- | --- | --- |
| 经典浅色 `light` | `#fafaf9` | `#ffffff` | `#e11d48` | `#78716c` |
| 深色夜间 `dark` | `#0c0a09` | `#1c1917` | `#f43f5e` | `#a8a29e` |
| 跟随系统 `system` | 跟随系统 | 跟随系统 | 跟随系统 | 跟随系统 |
| 暖沙纸境 `warm_paper` | `#faf7f2` | `#ffffff` | `#de5b6d` | `#6b5fb5` |
| 北欧冷杉 `nordic_frost` | `#f8fafb` | `#ffffff` | `#2d7a64` | `#0ea5e9` |
| 巴黎晨光 `parisian_dawn` | `#faf8f5` | `#ffffff` | `#c84b5b` | `#b87e43` |
| 深海星图 `midnight_obsidian` | `#151921` | `#1c212c` | `#0ea5e9` | `#a855f7` |
| 京都茶席 `kyoto_zen` | `#f8faf7` | `#ffffff` | `#3d6b4f` | `#c2413b` |

新增主题时必须提供工作区背景、表面、主文字、次文字、边框、主强调色、悬停色和焦点色；禁止只替换按钮颜色而留下不可读的边框或文字。

### 2.3 圆角与阴影

圆角表达“编辑工具”的柔和感，但不能让每一个元素都像胶囊：

| 场景 | 推荐值 |
| --- | --- |
| 页面卡片 | `rounded-2xl` |
| 重点/英雄卡片 | `rounded-3xl` |
| 按钮、输入框、弹窗内区块 | `rounded-xl` |
| 标签、状态徽章、计数徽标 | `rounded-full` |
| 小型标签或平台标记 | `rounded-md` |

| 阴影 | 用途 |
| --- | --- |
| `shadow-2xs` | 默认卡片、按钮、轻微层级 |
| `shadow-subtle` | 需要略微浮起的表面 |
| `shadow-card` | 卡片悬停或重点卡片 |
| `shadow-card-hover` | 明确可交互的悬停层级 |
| `shadow-modal` | 模态框、抽屉、浮层 |

默认卡片配方：

```html
<section class="rounded-2xl border border-stone-200/70 bg-white shadow-2xs
  transition-all hover:-translate-y-0.5 hover:shadow-card
  dark:border-stone-800 dark:bg-stone-900">
  <!-- 内容 -->
</section>
```

阴影应当低调。推荐先使用边框和背景区分层级，只有可悬停或需要脱离文档流的元素才增加明显阴影。

### 2.4 间距与断点

- 以 Tailwind 4px 间距单位为基础；相邻内容通常使用 `gap-2`、`gap-3` 或 `gap-4`。
- 页面内容推荐 `max-w-7xl mx-auto px-4 sm:px-8 py-5 sm:py-8`。
- 页面级区块推荐 `space-y-6 sm:space-y-8`。
- 卡片内边距通常为 `p-4` 或 `p-5`；重点卡片为 `p-6 sm:p-8`。
- 使用 Tailwind 默认断点：`sm=640px`、`md=768px`、`lg=1024px`、`xl=1280px`。
- 当前布局以 `md` 作为桌面侧栏与移动导航的切换点。

## 3. 字体与排版

### 3.1 字体栈

业务界面默认使用无衬线字体：

```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

- 中文业务文本、标题、按钮、标签、说明和表单内容必须使用无衬线业务字体。
- `font-serif` 仅用于确有编辑感需求的长文标题或内容展示，不作为通用 UI 字体。
- `font-mono` 只用于代码、URL、JSON、BV 号、快捷键、时间码、提词器标记等真正需要等宽的内容。

### 3.2 字号层级

| 层级 | Tailwind 示例 | 用途 |
| --- | --- | --- |
| 页面标题 | `text-xl sm:text-2xl font-bold leading-tight tracking-tight` | 页面主标题 |
| 重点标题 | `text-xl sm:text-2xl lg:text-3xl font-bold leading-tight` | 重点内容、主推选题 |
| 卡片标题 | `text-sm font-bold leading-snug` | 卡片、列表项标题 |
| 正文 | `text-sm sm:text-base leading-relaxed` | 摘要、说明、长文本 |
| 标签/按钮 | `text-xs font-semibold` | 常规操作和状态 |
| 辅助信息 | `text-xs text-stone-500` | 元信息、次要描述 |
| 微型信息 | `text-[10px]` 或 `text-[11px]` | 紧凑徽章、表格辅助列 |

排版规则：

- 中文标题默认 `font-bold`，正文默认 `font-normal` 或 `font-medium`。
- 标题使用 `leading-tight`，卡片标题使用 `leading-snug`，长文使用 `leading-relaxed`。
- 长标题使用 `text-balance`，摘要和正文使用 `text-pretty`。
- 业务文本与数值必须拆成独立节点。例如：

```tsx
<span className="text-xs text-stone-500">
  资料：<span className="font-mono tabular-nums">12</span> 条
</span>
```

- 日期、数量、金额、页码等对齐型数值使用 `tabular-nums`，但不因此把整句中文变成等宽字体。
- 相同语义的日期徽标、统计摘要和拖拽浮层必须保持相同字号、字重、行高和间距。

### 3.3 编辑器与特殊文本

- 文案编辑器正文推荐 `16px`、`line-height: 1.8`，保证长时间阅读和修改舒适。
- 编辑器标题层级使用清晰的大小差异，不依赖颜色单独区分层级。
- 引用使用左侧强调边框、浅色背景和适度斜体；不要使用大面积引号装饰。
- 提词器标记、引用标记和代码片段可以使用等宽字体或独立色彩，但必须保持可读性和可复制性。

## 4. 页面布局

### 4.1 页面骨架

桌面端采用“侧栏 + 顶部导航/内容区”的工作台结构；移动端使用底部导航和侧滑抽屉。内容区不要贴边，也不要在每个页面重新发明最大宽度。

```html
<main class="min-h-dvh overflow-y-auto bg-stone-50 dark:bg-stone-950">
  <div class="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
    <!-- PageHeader -->
    <!-- page sections -->
  </div>
</main>
```

### 4.2 页面标题区

页面标题使用图标、标题、可选徽章和右侧操作组成。标题区在移动端纵向排列，操作区允许换行：

```html
<header class="flex flex-col gap-3 border-b border-stone-200/70 pb-4
  sm:flex-row sm:items-center sm:justify-between sm:gap-4
  dark:border-stone-800">
  <div class="flex min-w-0 items-center gap-3">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl
      bg-rose-500/10 text-rose-600 dark:text-rose-400">
      <!-- Lucide icon, decorative -->
    </span>
    <h1 class="min-w-0 text-xl font-bold leading-tight tracking-tight
      text-stone-900 sm:text-2xl dark:text-stone-100">
      页面标题
    </h1>
  </div>
  <div class="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
    <!-- actions -->
  </div>
</header>
```

### 4.3 侧栏与移动导航

- 桌面侧栏宽度使用 `w-64`，背景为表面色，右侧使用弱边框。
- 当前导航项使用浅色表面、粗体和轻微阴影；不要使用高饱和大色块占满导航。
- 移动底部导航必须固定在底部，使用半透明表面和 `backdrop-blur`。
- 底部导航必须加入 `pb-[max(0.5rem,env(safe-area-inset-bottom))]` 或等价安全区处理。
- 导航按钮和主要触控控件至少为 `min-h-11 min-w-11`。

## 5. 组件规范

### 5.1 按钮

主行动按钮：

```html
<button class="inline-flex min-h-11 items-center justify-center gap-2
  rounded-xl bg-rose-600 px-4 text-sm font-bold text-white shadow-2xs
  transition-all hover:bg-rose-700 hover:shadow-xs active:scale-[0.98]
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
  focus-visible:ring-offset-2">
  主要操作
</button>
```

按钮层级：

- 主按钮：Rose 或当前主题主强调色，页面中应控制数量。
- 次按钮：白色/表面背景、Stone 文字和弱边框，用于并列或返回操作。
- 危险按钮：只用于删除、移入回收站等破坏性操作，使用 Red/Rose，并配合确认弹窗。
- 图标按钮：必须有 `aria-label` 和 `title`，不可只让用户猜图标含义。
- 加载状态必须禁用重复提交并保留按钮尺寸，避免界面跳动。

### 5.2 卡片与摘要

- 普通卡片使用 `rounded-2xl`、`border-stone-200/70`、`bg-white`、`shadow-2xs`。
- 可交互卡片增加 `transition-all hover:-translate-y-0.5 hover:shadow-card`。
- 重点卡片可以使用 `rounded-3xl shadow-card` 和极弱的强调色渐变，但内容区域仍保持清晰。
- 摘要区域应先显示标签，再显示数值；数值使用 `font-mono tabular-nums`，中文标签不使用 `font-mono`。
- 空状态使用居中图标、短标题、简短说明和一个明确行动，不用大面积插画占位。

### 5.3 徽章、标签与状态

通用徽章推荐：

```html
<span class="inline-flex items-center gap-1.5 rounded-full
  bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold
  text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
  已确认
</span>
```

状态语义必须稳定：

| 状态 | 默认语义色 |
| --- | --- |
| 收集箱/次要 | Stone |
| 已立项/已确认/成功 | Emerald |
| 写稿中/信息 | Indigo 或 Sky |
| 待制作/准备中 | Purple |
| 已发布/已上线 | Teal |
| 待核实/临近截止 | Amber |
| 逾期/错误/危险 | Rose 或 Red |

优先级使用高（Rose）、中（Amber）、低/无（Stone）。标签胶囊保持中性背景，使用 `#标签` 或等价语义表达，不要把每个标签都变成高饱和色块。

### 5.4 日期、时间与数据

- 行动日期（排期、截稿、交付、下一步截止）使用统一相对状态：可见文字当天只显示“今天”，逾期只显示“已逾期 N 天”，未来日期显示绝对日期；完整日期保留在 `title`、`aria-label` 和 `<time dateTime>` 中。
- 已完成、已发布、归档事项和历史记录保持绝对日期。
- 日期展示必须保留完整 `title`、`aria-label` 和可机器读取的 `<time dateTime>`。
- 日期输入使用项目的 `DateInput`，不使用原生 `<input type="date">`。
- 金额、数量、播放量、页码和日期数值使用 `tabular-nums`；金额和技术标识可使用 `font-mono`。

### 5.5 表单控件

输入框、文本域和自定义选择器使用统一形态：

```html
<input class="min-h-11 w-full rounded-xl border border-stone-200/80
  bg-stone-500/[0.03] px-3 text-sm text-stone-900
  placeholder:text-stone-400 focus:bg-white focus:outline-none
  focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500
  dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100
  dark:focus:bg-stone-800" />
```

- 标签使用 `text-xs font-semibold text-stone-600`，错误信息使用 `text-xs font-medium text-red-600`。
- 输入错误必须同时有文字提示和 `aria-invalid`，不能只改变边框颜色。
- 下拉选择必须使用自定义 `CustomSelect`；菜单不能被滚动容器裁剪。
- 表单操作区在移动端允许纵向堆叠，主要按钮保持完整触控宽度。

### 5.6 弹窗、菜单与 Toast

- 所有 Modal、ConfirmDialog 和自定义菜单必须通过 Portal 挂载到 `document.body`。
- 弹窗必须支持 Escape 关闭、焦点锁定、焦点回收和 body 滚动锁定。
- 浮层位置使用统一定位逻辑，禁止把菜单绝对定位在可能有 `overflow: hidden/auto` 的业务容器内。
- 二次确认统一使用 `ConfirmDialog`，即时提示统一使用 `useToast`。
- 禁止使用 `window.alert`、`window.confirm`、`window.prompt`。
- 弹窗遮罩应当降低背景干扰，但不能过度变黑；内容面使用 `shadow-modal` 和表面色。

## 6. 图标、交互与动效

### 6.1 图标

- 统一使用 Lucide 图标，不混用多个图标库。
- 常规图标使用 `w-4 h-4`，导航图标使用 `w-4.5 h-4.5` 或 `w-5 h-5`，重点图标使用 `w-5 h-5`。
- 普通描边使用 `stroke-2`，主行动或激活状态可使用 `stroke-[2.5]`。
- 装饰性图标添加 `aria-hidden="true"`；单独图标按钮必须提供可访问名称。

### 6.2 动效节奏

默认使用短、轻、可预测的动效：

| 场景 | 时长 | 缓动 |
| --- | --- | --- |
| 颜色/阴影变化 | `150–200ms` | `ease-in-out` |
| 卡片悬停 | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| 页面/面板进入 | `200ms` | Editorial Out |
| Toast 出现 | `220ms` | Editorial Out |
| 退出/关闭 | `150ms` | ease-in |
| 按压反馈 | 即时 | `active:scale-[0.98]` |

推荐使用 `transition-colors` 或 `transition-all duration-200`。动效只辅助状态变化，不应延迟用户操作或持续制造注意力。

必须响应：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
  }
}
```

## 7. 响应式与无障碍

### 7.1 移动端规则

- 先设计单列移动布局，再在 `sm`/`md`/`lg` 扩展到多列。
- 所有可伸缩区域加入 `min-w-0`，文本根据场景使用 `truncate`、`line-clamp-*` 或 `break-words`。
- 卡片内容使用 `flex-wrap`，日期、标签和统计不得强行挤在同一行。
- 390px 视口必须检查页面首屏、弹窗、表格、底部导航和横向滚动。
- 固定底部元素必须处理 iOS Safari 安全区。

### 7.2 键盘与屏幕阅读器

- 所有交互元素必须可通过键盘到达，并有清晰的 `:focus-visible` 状态。
- 页面提供跳过导航的 skip link；弹窗和抽屉关闭后将焦点还给触发元素。
- 状态不能只用颜色表达；徽章、图标和装饰元素不能遮挡文本。
- 加载、保存成功、保存失败等状态使用 `aria-live` 或 Toast 传达。
- 表单控件必须有可关联的 `<label>`，图标按钮必须有 `aria-label`。
- 可点击的卡片应使用真正的 `<button>` 或 `<a>`，不要给普通 `<div>` 添加点击事件冒充控件。

## 8. 跨框架实现方式

无论使用 React、Vue、Svelte 或原生 HTML，都先建立以下语义层：

```text
color.surface        页面表面
color.canvas         工作区背景
color.text           主文字
color.muted          次文字
color.border         弱边框
color.accent         主行动色
color.success        成功/完成
color.warning        警告/待处理
color.danger         错误/逾期/危险
radius.card          16px
radius.control       12px
shadow.card          轻阴影
shadow.modal         弹窗阴影
motion.standard      200ms Editorial Out
```

推荐将这些语义令牌映射到 CSS Custom Properties，再由具体框架组件消费。组件只引用语义令牌，不直接依赖某一个主题的颜色值。Tailwind 项目可以直接使用本项目已有的 utility class；其他框架应保持相同的角色、比例和状态关系。

## 9. 常见错误

以下做法默认禁止：

- 中文业务文案整块使用 `font-mono`。
- 为每个新页面单独发明一套灰色、圆角或阴影。
- 使用原生 `<select>`、原生日期输入或浏览器原生弹窗。
- 把浮层菜单嵌在带 `overflow: hidden/auto` 的卡片或表格中。
- 用颜色作为唯一的错误、逾期或成功提示。
- 在移动端通过固定宽度、负边距或隐藏溢出来“修复”布局。
- 使用 `absolute` 代替正常文档流来布局主要内容。
- 为了视觉突出给大量标题使用大字号、全大写或强烈渐变。
- 忽略 `prefers-reduced-motion`、键盘焦点、Escape 和安全区。
- 用宽泛的主题选择器覆盖 `.font-mono`、所有 `.bg-white` 或所有输入元素，导致其他业务组件被污染。

## 10. 开发验收清单

提交前逐项确认：

- [ ] 页面沿用现有字体栈、字号层级、圆角、阴影和间距。
- [ ] 中文业务文本没有误套 `font-mono`；数值按需使用 `tabular-nums`。
- [ ] 主按钮、次按钮、危险操作和状态徽章符合语义色规则。
- [ ] 浅色、深色及至少一个彩色主题下文字和边框仍清晰可读。
- [ ] 390px 视口无横向溢出，卡片、日期、标签和操作可正常换行。
- [ ] 触控目标不小于约 44px，底部固定元素处理了安全区。
- [ ] 键盘可访问，焦点明显，图标按钮有名称，表单有标签。
- [ ] 弹窗支持 Escape、焦点管理和滚动锁定；菜单不会被容器裁剪。
- [ ] 未使用原生弹窗、原生 `<select>` 或原生日期输入。
- [ ] 动效在 `prefers-reduced-motion` 下被降低或关闭。
- [ ] 已在目标页面检查桌面首屏、移动首屏、浏览器控制台和实际渲染效果。

## 11. 现有实现参考

本规范的实现基准位于：

- `src/index.css`：基础令牌、主题覆盖、编辑器样式和动效。
- `tailwind.config.js`：字体、颜色、阴影和缓动扩展。
- `src/lib/theme.ts` 与 `src/components/ui/`：主题列表及公共 UI 组件行为。

当规范与代码实现出现差异时，新增页面应优先保持现有用户体验，并在必要时先更新本指南和公共令牌，再扩展业务组件。
