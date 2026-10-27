# AIRI 前端 React 重写迁移计划

## Context

AIRI 目前是全 Vue 3 技术栈：`apps/stage-web`、`apps/stage-tamagotchi` 两端，加 `packages/stage-ui`（264 个 `.vue`、3.15 万行）、`packages/stage-pages`（142 个 `.vue`，其中 107 个设置页）、`packages/ui`（57 个基于 reka-ui 的原语）、`packages/stage-layouts`（32 个）。项目维护者要求把前端完整改写为 React，同时保留已批准的动画方案替换（透明视频动画包）。

两条工作线合并执行：

1. 新建 React 应用与 React 组件层，复用纯 TypeScript 领域逻辑。
2. 不再移植 Live2D / VRM / MMD / Spine / Tachie，React 端只实现透明视频动画渲染器。

本次迁移不追求一次完成。P0 与 P1 完成并演示通过后再决定是否继续。Vue 应用在迁移期间保持可运行。

## 已确认决策

| 决策 | 选择 |
|---|---|
| 迁移范围 | 两端全部（Web + Electron），Web 优先 |
| 迁移方式 | 并行新建 React 应用，功能对齐后再删除 Vue 版 |
| React 技术栈 | React 19 + React Router 7 + Zustand 5 + TanStack Query 5 + UnoCSS + Radix（shadcn 风格）+ react-i18next |
| 旧渲染器 | 全部丢弃，只保留透明视频动画 |

## 目标包结构

```
packages/stage-domain          # 纯 TS，无 React / Vue / Zustand
packages/stage-stores          # Zustand vanilla 切片 + 跨窗口同步引擎
packages/ui-react              # Radix 原语与设计令牌，无业务逻辑
packages/stage-ui-react        # React 组件、hooks、查询、i18n、布局（暂放）
packages/stage-pages-react     # P3 之后抽取的设置页注册表
apps/stage-web-react           # P1
apps/stage-tamagotchi-react    # P5
```

原样复用：`packages/stage-shared`、`packages/character-animation`、`packages/core-character`、`packages/i18n`（只作为消息源）、`packages/audio`、`packages/server-sdk`、非渲染类 `model-driver-*`、`packages/provider-inference`。

`stage-domain` 与 `stage-stores` 必须分成两层。领域逻辑不能依赖状态库，否则未来独立桌宠宿主无法复用。

**不移植**：`stage-ui-live2d`、`stage-ui-three`、`stage-ui-mmd`、`stage-ui-spine`、`stage-ui-tachie`、`stage-ui/src/stores/live2d.ts`、`stage-ui/src/stores/three.ts`、`stage-ui/src/features/motions/live2d`、`settings/stage-model.ts` 的渲染器分支、Histoire、`dockview-vue`、`splitpanes`、`vaul-vue`、`embla-carousel-vue`、`virtual:generated-layouts`、`pinia-plugin-tracing`、`directives/track-button`、`@vueuse/motion`、`Tres`、`vue-macros`。

透明视频渲染器放在 `packages/stage-ui-react/src/components/character/transparent-video.tsx`。它只消费 `AnimationController.dispatch()` 产生的命令，A/B 两个 `<video>` 做交叉淡入，不修改 `packages/character-animation` 的状态机。

## 分支

从当前分支 `kallen/feat/animation-video-stage` 新建 `kallen/feat/react-frontend`。动画核心包是 P1 的依赖，必须先于 React 应用合入。

## 阶段

### P0 工具链（可单独合并）

- `pnpm-workspace.yaml` 的 catalog 增加：`react`、`react-dom`、`@types/react`、`@types/react-dom`、`react-router`、`zustand`、`@tanstack/react-query`、`i18next`、`react-i18next`、常用 `@radix-ui/*`、`@vitejs/plugin-react`、`@testing-library/react`、`@testing-library/jest-dom`、`vitest-browser-react`、`eslint-plugin-react-hooks`。
- `eslint.config.ts` 增加 `**/*.tsx` 作用域块，保留 `vue: true` 直到 P6。
- 新增 ADR `docs/ai/adr/00xx-react-frontend-rewrite.md`，记录布局、状态、同步、i18n 四个决定。
- 执行 `pnpm install --no-frozen-lockfile`，修复当前 `@proj-airi/character-animation` 导致的 lockfile 过期错误。

### P1 最小可演示

目标：`apps/stage-web-react` 可用 `pnpm dev` 启动，`/` 显示透明视频角色，说话、情绪、点击都由 `AnimationController` 驱动，可切换 `en` 与 `zh-Hans`。

新建文件：

- `apps/stage-web-react/package.json`（`@proj-airi/stage-web-react`）
- `apps/stage-web-react/index.html`
- `apps/stage-web-react/vite.config.ts`：镜像 `apps/stage-web/vite.config.ts` 的 alias、`Unocss()`、worker 配置，去掉全部 Vue 插件
- `apps/stage-web-react/src/main.tsx`、`src/App.tsx`
- `apps/stage-web-react/src/router/routes.tsx`：`createBrowserRouter`，HF Space 环境用 `createHashRouter`，与 `apps/stage-web/src/main.ts` 的 `isEnvTruthy(import.meta.env.VITE_APP_TARGET_HUGGINGFACE_SPACE)` 对齐
- `packages/ui-react/src/button.tsx`、`dialog.tsx`：用 Radix 写第一批原语
- `packages/stage-ui-react/src/components/character/transparent-video.tsx`
- `packages/stage-ui-react/src/i18n/index.ts`

不含聊天、设置、账号。

### P2 设置外壳与同步基建

- `packages/stage-ui-react/src/layouts/settings.tsx`：对应 `packages/stage-layouts/src/layouts/settings.vue`，侧边栏导航用数据注册表渲染。
- `packages/stage-stores/src/sync/{transport,engine}.ts` 与 `broadcast-transport.ts`。
- 迁移 5 个设置页：设置首页、provider、model、speech、theme。
- 产出双标签页同步测试。

### P3 聊天域

聊天会话语义、流式 LLM、TTS/ASR。此阶段结束为**强制停点**，见风险第 1 条。

### P4 余下页面

按注册表推进 107 个设置页，加 auth、onboarding、devtools、background、widgets。未使用的页面进白名单，不追求全量。

### P5 Electron

主进程与 preload 不动（均为框架无关 TS）。新增 `apps/stage-tamagotchi-react`，渲染入口 `src/renderer/main.tsx`。Eventa 契约继续使用 `apps/stage-tamagotchi/src/shared/eventa`。

### P6 清理

删除 Vue 应用、Vue 包与 Vue 依赖，改 `AGENTS.md`、CI、`eslint.config.ts`。移动端已从仓库移除，不再有 React 版。

## 四个硬缺口

### 1. `pinia-plugin-synced` → Zustand

现有实现见 `packages/stage-ui/src/libs/pinia/setup-synced.ts`：`namespace: 'airi:stage:pinia'`、`callTimeout: 300000`（5 分钟）、页面卸载时 `dispose()`。20 个 store 使用 `synced`。

替换方案：

- 接口 `packages/stage-stores/src/sync/transport.ts`：`publish`、`subscribe`、`role`、`onRoleChange`。
- 浏览器用 `broadcast-transport.ts`，底层复用 `tab-election`，namespace 改为 `airi:stage:zustand`。
- Electron 不用 BroadcastChannel。多个 renderer 可能位于不同协议或 partition，且主进程已持有窗口注册表。新增契约 `apps/stage-tamagotchi/src/shared/eventa/sync.ts`，主进程实现 `apps/stage-tamagotchi/src/main/services/electron/sync-broker.ts`，向所有 `webContents` 广播并做 leader 选举，窗口关闭时回收。
- 引擎只写一份 `engine.ts`：快照版本号、操作 id、幂等重放、leader 交接。
- 需要同步的切片：auth、chat-session、chat-stream 控制、provider-config、stage-model-selection、speech、hearing、consciousness、onboarding、presence-bubble。

### 2. vue-i18n → react-i18next

`packages/i18n/src/locales/*` 是 YAML，使用 `{name}` 插值（例如 `packages/i18n/src/locales/en/stage.yaml:90`）。

- 新增 `scripts/i18n/build-i18next.ts`，生成 `packages/i18n/generated/i18next/<locale>.json`：`{name}` → `{{name}}`，`a | b | c` 按 `Intl.PluralRules` 拆成 `_one/_few/_many/_other`。
- `packages/i18n/package.json` 增加 `"./i18next/*"` 出口。
- 绑定在 `packages/stage-ui-react/src/i18n/index.ts`，`fallbackLng: 'en'`。
- 新增 `packages/i18n/src/i18next-parity.test.ts`，用同一组 fixture 对比两种运行库输出，覆盖 `ru` 的 few/many 与 `zh` 的 other。

Crowdin 流水线保持不动，`packages/i18n/src/locales` 仍是唯一消息源。

### 3. 自动路由与布局 → React Router 7

- 路由写在 `apps/stage-web-react/src/router/routes.tsx`，布局变父路由 `element` + `<Outlet />`。
- 设置页按数据注册表组织：`packages/stage-pages-react/src/pages/settings/registry.ts`，条目为 `{ path, titleKey, icon, component }`。
- 新增测试，比对现有 Vue 路由清单，未移植项写入 `dropped-routes.ts` 白名单。
- 进度条接 `useNavigation().state`。

### 4. Pinia → Zustand，`@pinia/colada` → TanStack Query

- 服务端状态全部进 `packages/stage-ui-react/src/queries/` 的 `queryOptions` 与 queryKey 工厂（provider 模型列表、display model 可用性、角色列表）。
- 聊天流属于事件流，写入 `chat-stream` 切片，不走查询缓存。
- `defineStore` → `createStore`（vanilla）。每域一个 `packages/stage-stores/src/stores/<domain>/index.ts`，跨域只通过参数传递，避免循环依赖。
- `storeToRefs` → `useShallow`，`computed` → selector，`watch` → `subscribeWithSelector` 或 `useEffect`。
- 根 Provider：`packages/stage-ui-react/src/providers/store-provider.tsx`。

## 测试与 CI

- 每个 React 包独立 `vitest.config.ts`：`unit`（jsdom，`*.test.tsx`，Testing Library）与 `browser`（`*.browser.test.tsx`，`vitest-browser-react` + Playwright chromium）。
- React 包 typecheck 用 `tsc --noEmit`，不装 `vue-tsc`。根 `pnpm typecheck` 由 Turbo 覆盖新包。
- `.github/workflows` 的 build 矩阵在 P1 加 `stage-web-react`，P5 加 `stage-tamagotchi-react`。
- `AGENTS.md`：Project Map 增加 React 行，Task Routing 把 Vue 规则限定到 `.vue` 与 Vue 包，新增 `enforce-rules-for-react` skill，Code Rules 写明新代码只写 React。按仓库规则，该改动单独提交。

## 风险

1. **同步语义丢失**。现有同步含 leader RPC 与 5 分钟超时。先做双栈对照测试，Electron 双窗口冒烟通过前不切换主窗口。
2. **107 个设置页体量过大**。按实际使用裁剪，未用页面进白名单。
3. **i18n 复数与条款漂移**。编译脚本加 parity 测试作为合并门槛。
4. **双栈 CI 时间与依赖膨胀**。用 Turbo 过滤器，并定下 Vue 删除日期。
5. **composable → hook 的生命周期泄漏**。93 个 composable 含事件监听与动画循环，`useEffect` 清理写进 lint 规则与评审清单。

**强制停点**：P3 结束。判据为聊天完整回合在 React 中无功能缺口、p95 延迟不高于 Vue 版 10%、双标签页与 Electron 双窗口同步测试全绿。任一不达标就停止扩展页面，重新评估同步传输或缩小范围。

## 验证

| 阶段 | 命令 |
|---|---|
| P0 | `pnpm install --no-frozen-lockfile`、`pnpm lint`、`pnpm typecheck` |
| P1 | `pnpm -F @proj-airi/stage-web-react dev`（人工对照 Vue 版）、`pnpm -F @proj-airi/stage-web-react typecheck`、`pnpm -F @proj-airi/stage-web-react exec vitest run`、`pnpm -F @proj-airi/stage-web-react build` |
| P2 | `pnpm -F @proj-airi/stage-stores exec vitest run`、`pnpm -F @proj-airi/stage-ui-react exec vitest run` |
| P3 | `pnpm -F @proj-airi/i18n exec vitest run`、`base=$(git merge-base origin/main HEAD); TURBO_SCM_BASE=$base pnpm exec turbo run test:run --affected` |
| P5 | `pnpm -F @proj-airi/stage-tamagotchi-react build`、Vishot Electron 场景截图 |
| P6 | `pnpm test:run`、`pnpm lint`、`pnpm typecheck` |

每个阶段结束时执行 `pnpm lint`，并只报告实际执行过的检查。

## 本次实施范围

先做 P0 与 P1。P0 完成后立即验证工具链，P1 完成并演示通过后停下，由维护者决定是否进入 P2。
