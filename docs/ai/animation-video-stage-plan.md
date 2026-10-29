# AIPETS 动画方案替换计划（以 dsh-pet 透明视频方案替换现有渲染器）

- 分支：`kallen/feat/animation-video-stage`
- 状态：方案待确认，确认后进入 Phase 1
- 最终状态：AIPETS 只保留一种角色渲染方式 —— 透明视频动画包

## 0. 决策摘要

| 项目 | 决定 |
| --- | --- |
| 角色表现层 | 全部替换为透明视频片段（VP9 Alpha WebM，Safari 回退 HEVC MOV） |
| 驱动方式 | 保留 AIPETS 现有 ACT 事件与情绪队列，改为“选片段”而不是“改骨骼/参数” |
| 旧渲染器 | Live2D / VRM / MMD / Spine / Tachie 最终删除 |
| 对话、语音、记忆、Provider、账号 | 不动 |
| 动画包格式 | 一个 ZIP + `manifest.json` + 透明视频 + 预览图 |
| 施工方式 | 先冻结契约 → 建视频渲染器 → 产品面切换 → 删除旧代码 → 补物理交互 |
| 模块边界 | 动画核心逻辑独立成包，宿主适配与 Eventa 契约分离，便于将来扩展桌宠宿主 |

### 决策记录

- 2026-10-24：**放弃 Live2D 路线**。桌宠形象没有 Live2D 资源，重新制作分层模型不具备可行性。
- 2026-10-24：**放弃 VRoid Studio / VRM 路线**。3D 卡通风格与项目要求的形象形态不一致。
- 最终结论：唯一角色方案为透明视频动画包，不再评估其他渲染器作为替代。

---

## 1. AIPETS 动画能力全景（替换前必须掌握）

### 1.1 驱动链路

```text
LLM 回复
  → pipelines-audio 解析 <|ACT {emotion/motion/expression}|> 标记
  → Eventa 事件（llm-marker-parser 产出）
  → Stage.vue 接收 act
  → 情绪队列（带 intensity、优先级、排队）
  → 当前渲染器执行：motion / expression / 参数
```

关键事实：

- 情绪枚举固定 9 种：`happy / sad / angry / think / surprised / awkward / question / curious / neutral`。
- `act.motion` 目前只有 Live2D 分支会执行，其他渲染器忽略。
- `act.expression` 走 `setExpression`，各渲染器自行解释。
- `nowSpeaking` 由语音播放状态驱动，是口型和说话动画的唯一开关。
- 所有动画最终都汇总到 `Stage.vue` 一个分发点，这是替换的切入点。

### 1.2 Stage 对外契约

Stage 对外暴露：

- `canvasElement`：截图、Polaroid、背景移除等能力依赖它。
- `captureFrame`：捕获当前画面。
- `readRenderTargetRegionAtClientPoint`：读取某点的渲染目标，用于点击命中与颜色采样。
- `setExpression`：执行表情。
- props：`nowSpeaking`、`paused`、`cursorPosition`、`mouthOpenSize`、`audioSource`、模型缩放与位置等。

替换时必须保留这些接口，否则截图、点击、情绪联动会一起失效。

### 1.3 各渲染器能力矩阵

| 渲染器 | 待机动画 | 情绪 | 口型 | 视线 | 物理 | 用户素材 |
| --- | --- | --- | --- | --- | --- | --- |
| Live2D | motion 组 | motion 组 + 参数 | 实时参数 | 眼球参数 | 模型物理 | 导入 model3 ZIP |
| VRM | 仅内置 idle vrma | expression（部分） | viseme 实时 | 眼球/头部 | spring bone | 导入 `.vrm` |
| MMD | VMD idle | morph + VMD 动作 | morph 实时 | 注视 | 刚体/IK | 导入 `.vmd` |
| Spine | track 0 循环 | track 1 一次性 | 无 | 无 | 无 | 骨架自带动画 |
| Tachie | 无 | 换图 | 无 | 无 | 无 | 图片集 |

### 1.4 周边动画能力（不属于某个渲染器，但要接入）

- Beat Sync：桌面端系统音频节拍驱动。
- 口型同步：音频频谱驱动，视频方案下需要降级。
- 视距/视角：VRM 支持轨道旋转，视频方案固定机位。
- 点击交互：VRM 命中测试、Live2D hit area。
- 场景效果：背景图、粒子、主题色、气泡、字幕、工具卡片。
- 截图与 Polaroid：依赖 `captureFrame`。
- 显示模型云同步：目前只支持 `live2d-zip` 与 `vrm`。

### 1.5 视频方案无法等价保留的能力

| 能力 | 原因 | 降级方式 |
| --- | --- | --- |
| 实时口型 | 视频画面是预渲染的 | 用 `talk` 片段近似 |
| 连续表情强度 | 片段是离散的 | 按 intensity 分档选片段 |
| 视线跟随鼠标 | 画面固定 | 预渲染 `look/left`、`look/right`，默认关闭 |
| 骨骼/头发物理 | 没有骨骼 | 固定画面，或做整体元素物理 |
| 任意视角旋转 | 视频是单机位 | 不支持 |
| 用户自带模型导入 | 只接受视频包 | 提供动画包制作规范 |

---

## 2. 替换后的目标架构

### 2.1 唯一渲染器

新增 `animation` 渲染器，最终成为唯一角色渲染器。

- 输入：动画包 ZIP。
- 输出：A/B 双 `<video>` 交叉淡入的透明画面。
- 对外：实现与现有 Stage 相同的 props 与暴露方法。
- 不再保留“多渲染器可选”的产品入口。

### 2.2 事件到片段的映射

| AIPETS 状态 | 动画行为 |
| --- | --- |
| 空闲 | 播 `idle` 基础链 |
| `nowSpeaking = true` | 切到 `talk` 基础链，结束后回 `idle` |
| `act.emotion` | 按 `emotion.<name>` 选片段，按 intensity 分档 |
| `act.motion` | 若 `actions` 有同名条目则播一次 |
| `act.expression` | 若 `expressions` 有同名条目则播一次 |
| 用户点击 | 播 `click` 候选，可按 head/body 区分 |
| 思考状态 | 播 `thinking` 链 |
| `paused` | 暂停当前视频 |
| Beat Sync | 播 `beat` 片段（可选） |

### 2.3 能力降级策略

| 损失能力 | 替代方案 |
| --- | --- |
| 实时口型 | `talk` 片段；或保留一个“嘴部叠加层”作为后续可选增强，本期不做 |
| 表情强度 | 每个情绪支持多档片段（`tiers`），按 `intensity` 阈值选 |
| 视线跟随 | `look/left`、`look/right` 片段，按鼠标区域触发；默认关闭 |
| 物理 | 固定机位视频；桌面端用窗口/元素物理（见 Phase 4） |
| 自定义模型 | 只接受视频包；提供制作脚本与规范 |

### 2.4 解耦边界（为将来的桌宠宿主预留）

目标：动画能力不只服务 AIPETS 舞台，还能被独立桌宠宿主复用。按“核心逻辑 / 宿主适配 / 事件契约”三层拆开。

| 层 | 位置 | 允许依赖 | 禁止依赖 |
| --- | --- | --- | --- |
| 核心 | `packages/character-animation` | 纯 TypeScript | Vue、Pinia、DOM、JSZip、IndexedDB、Eventa、stage-ui |
| 宿主适配 | `packages/stage-ui/src/adapters/animation` | 核心包、Vue、JSZip、IndexedDB | 具体 app |
| 事件契约 | `packages/character-animation/src/contracts` | 核心类型、`@moeru/eventa` | Vue、Pinia、app |
| 应用接入 | stage-ui、stage-tamagotchi、将来的桌宠宿主 | 以上全部 | 互相反向依赖 |

核心包负责：

- manifest schema 与校验。
- 权重选择、避免连续重复、强度分档。
- 播放状态机：基础链、一次性层、暂停、打断、淡入淡出决策。
- 纯函数物理：拖拽弹簧、抛掷、边缘反弹（Phase 4）。

核心包不碰 DOM，播放动作通过端口交给宿主：

```ts
interface AnimationPlayerPort {
  play: (clipId: string, options?: { fadeMs?: number }) => Promise<void>
  pause: () => void
  resume: () => void
  currentClipId: () => string | null
}

interface AnimationClockPort {
  now: () => number
  setTimer: (delayMs: number, cb: () => void) => () => void
}

interface AnimationPackStore {
  list: () => Promise<PackSummary[]>
  load: (id: string) => Promise<LoadedPack>
}
```

宿主只做两件事：实现端口，把宿主事件翻译成意图。

```ts
type AnimationIntent
  = | { kind: 'idle' }
    | { kind: 'talk', speaking: boolean }
    | { kind: 'emotion', emotion: string, intensity: number }
    | { kind: 'action', name: string }
    | { kind: 'click', area?: 'head' | 'body' }
    | { kind: 'thinking' }
    | { kind: 'beat', strength: number }
```

依赖方向：

```text
apps（stage-web / stage-tamagotchi / 未来桌宠宿主）
  → stage-ui 适配层（Vue 组件、ZIP、IndexedDB、设置页）
    → character-animation 核心（纯逻辑）
```

跨进程契约独立导出，供桌宠窗口与控制端共用：

```text
playAnimation / setIntent / getSnapshot / pause / resume
```

宿主扩展规则：

- 新增宿主时，只实现 `AnimationPlayerPort`、`AnimationPackStore` 和窗口物理。
- 不导入 `@proj-aipets/stage-ui`，避免把 AIPETS 的 Pinia、路由和页面依赖带进宿主。
- 动画包格式与命名保持中立，不使用 `stage`、`aipets`、`live2d` 等业务词。
- AIPETS 的 `act`、情绪枚举在适配层转换，核心包不识别 AIPETS 专有事件。

---

## 3. 动画包规范（唯一输入格式）

### 3.1 目录结构

```text
manifest.json
preview.png                 # 可选
idle/breathe.webm
idle/wave.webm
talk/talk-01.webm
emotion/happy-1.webm
emotion/happy-2.webm
action/wave.webm
long/swing-start.webm     # 可选：长期动作的进入片段
long/swing-loop.webm      # 长期动作的循环片段
long/swing-end.webm       # 可选：长期动作的退出片段
expression/smile.webm
click/poke.webm
thinking/think-01.webm
beat/dance-01.webm
```

首批长期动作素材位于 `assets/<角色>/state/`，命名格式为 `<名称>-start.webm` 与 `<名称>-end.webm`。loop 片段补齐后，在 `longActions` 里登记同名条目即可。

### 3.2 manifest.json

```json
{
  "manifestVersion": 1,
  "id": "my-pet",
  "name": "My Pet",
  "canvas": { "width": 1280, "height": 720 },
  "preview": "preview.png",
  "anchor": { "x": 0.5, "y": 1 },
  "animations": {
    "idle": [
      { "src": "idle/breathe.webm", "weight": 4, "loop": true },
      { "src": "idle/wave.webm", "weight": 1, "loop": true }
    ],
    "talk": [
      { "src": "talk/talk-01.webm", "weight": 1, "loop": true }
    ],
    "thinking": [
      { "src": "thinking/think-01.webm", "weight": 1, "loop": true }
    ],
    "click": {
      "head": ["click/poke.webm"],
      "body": ["click/poke.webm"]
    },
    "emotion": {
      "happy": {
        "low": ["emotion/happy-1.webm"],
        "high": ["emotion/happy-2.webm"]
      },
      "sad": {
        "low": ["emotion/sad-1.webm"],
        "high": ["emotion/sad-2.webm"]
      }
    },
    "actions": {
      "wave": "action/wave.webm"
    },
    "longActions": {
      "swing": {
        "start": "long/swing-start.webm",
        "loop": { "src": "long/swing-loop.webm", "durationMs": 4000 },
        "end": "long/swing-end.webm"
      }
    },
    "expressions": {
      "smile": "expression/smile.webm"
    },
    "beat": ["beat/dance-01.webm"],
    "look": {
      "left": "action/look-left.webm",
      "right": "action/look-right.webm"
    }
  },
  "transition": { "fadeMs": 180 },
  "audio": "keep"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `manifestVersion` | 是 | 固定为 1 |
| `id` | 是 | 小写、无空格，用于本地存储 |
| `name` | 是 | 列表显示名 |
| `canvas` | 是 | 设计分辨率，用于等比缩放 |
| `anchor` | 否 | 落地锚点，默认底部居中 |
| `animations.idle` | 是 | 至少一条，否则无效 |
| `animations.talk` | 否 | 缺失时说话沿用 idle |
| `animations.emotion` | 否 | 支持 low/high 两档 |
| `animations.actions` | 否 | 对应 `act.motion`，播放一次 |
| `animations.longActions` | 否 | 长期动作，计时器控制 loop 循环与 end 插入 |
| `animations.expressions` | 否 | 对应 `act.expression` |
| `transition.fadeMs` | 否 | 默认 180ms |
| `audio` | 否 | `keep` 保留原声，`mute` 静音 |

### 3.3 播放模型

- **基础层**：`idle`、`talk`、`thinking` 三条链。片段播完按权重抽下一个，避免与上一个重复。
- **一次性层**：情绪、点击、动作、表情。播完自动回基础层。播放期间新请求排队，不切断当前片段。
- **长期动作**：`longActions` 条目按 `start → loop（循环）→ end` 播放，由真实计时器控制总时长。计时从 start 片段的第一帧开始，start 的时长计入预算。到时只标记预算用完，等当前片段播完再插入 end，所以实际时长最多比请求多一个当前片段。未传时长时用 `defaultDurationMs`，缺失则用 loop 的 `durationMs`。`start`、`end` 可省略。每段长期动作片段都是非循环片段，播完触发一次 `clipEnded`。loop 片段重播不做淡入，接缝为硬切。
- **中断类型**：
  - 计时器到时：只发送结束请求，等当前片段播完，播 `end`，再回基础层。
  - 意图抢占（说话、思考、情绪、点击、其他动作、显式播放片段、idle）：不放弃正在播的片段，等它播完，再播 `end`，然后执行抢占请求。
  - 显式停止：`{ type: 'longActionStop' }` 等当前片段播完，再播 `end`，然后按当前标志回基础链。
  - 暂停：冻结计时器并保留剩余预算，恢复后继续计时；暂停不重置时长。
  - 宿主卸载：调用 `controller.dispose()` 清除计时器。
- **不放弃原则**：任何非循环片段正在播放时，新请求都先排队；循环片段没有终点，可以直接淡入替换。
- **打断规则**：
  - 情绪可打断情绪，但要等当前片段播完。
  - 说话开始会等一次性动画播完，再回到 `talk`。
  - `paused` 暂停当前视频，恢复后继续。
- **切换方式**：A/B 双 `<video>`，旧视频延迟卸载，新视频 `opacity` 淡入，避免白帧。
- **预加载**：加载动画包时把所有片段 `fetch` 成 Blob URL，播放时不再请求网络。
- **自动播放**：视频必须 `muted` 与 `playsinline`，否则浏览器会阻止。

### 3.4 导入与校验

- 只接受一个 ZIP，最大 200 MB。
- 必须包含且只包含一个 `manifest.json`；允许整包套一层目录。
- 视频扩展名只接受 `.webm` / `.mov` / `.mp4`。
- 至少一条 `idle`；引用文件必须存在，大小写一致。
- 校验失败要输出可读报告：缺文件、路径越界、manifest 语法错误、无 idle。
- 预览优先用 `preview.png`；没有则截取第一段 idle 的首帧。

---

## 4. 分阶段实施

### Phase 0：冻结基线（不改产品行为）

1. 记录 Stage 对外 props 与 expose 方法。
2. 记录所有调用 `Stage.vue`、`useDisplayModels`、`useStageModelSettings` 的入口。
3. 记录显示模型导入、云同步、角色卡的头像类型。
4. 输出“能力损失确认单”，逐条确认接受 1.5 节中的损失。

### Phase 1：视频渲染器与动画包

1. 新增 `@proj-aipets/character-animation` 核心包：manifest schema、类型、权重选择器、播放状态机、端口定义。
2. 新增 stage-ui 适配层：ZIP 解析、Blob URL、预览图、IndexedDB 存储。
3. 新增 `animation` 格式与导入流程。
4. 实现 `VideoAnimationScene.vue`：A/B 切换、基础链、一次性层、暂停、点击、`captureFrame`。
5. 在 `Stage.vue` 增加 `animation` 分支，**暂时**保留旧分支用于对照验证。
6. 导入菜单增加 Animation ZIP，生成预览图。
7. 跑 character-animation 单测、stage-ui 类型检查与相关单测。

> 施工期并存只用于回滚和对照，不是产品上的“多渲染器可选”。Phase 3 删除。

### Phase 2：产品面切换

1. `StageModelRenderer` 默认值改为 `animation`。
2. 从导入菜单移除 Live2D / VRM / MMD / Spine / Tachie。
3. 角色卡头像类型收敛为 `animation`，新卡只能绑定动画包。
4. 云端模型格式改为 `animation-zip`，服务端 schema 同步修改。
5. 设置页删除五种模型设置，新增动画包设置（大小、镜像、淡入时长、点击开关、预加载策略）。
6. i18n 删除旧渲染器文案，新增动画包文案（只改英文源与中文）。

### Phase 3：删除旧方案

1. 删除 Stage 中五种渲染器分支、props、emit、`canvasElement` / `readRenderTargetRegionAtClientPoint` 分支。
2. 删除五个渲染包及其依赖。
3. 删除模型设置页、导入报告弹窗、预览生成器、Live2D 动作提示词、动作开发者工具。
4. 删除预设 Live2D/VRM 资源与构建期下载配置。
5. 删除相关测试、故事、文档引用。
6. 服务端删除旧格式枚举并写迁移；旧数据策略见第 6 节。

### Phase 4：交互与物理（dsh-pet 体验）

1. 点击挤压、拖拽弹簧、甩抛抛物线、边缘反弹。
2. 交互逻辑放核心包（纯函数），窗口约束放 stage-tamagotchi 主进程。
3. 桌面模式支持“局部透明小窗 + 位置持久化”。
4. 移动端只保留缩放、拖拽、点击，不做跨屏。

---

## 5. 文件级改动清单

### 5.1 删除

| 范围 | 内容 |
| --- | --- |
| 渲染包 | `packages/stage-ui-live2d`、`stage-ui-three`、`stage-ui-mmd`、`stage-ui-spine`、`stage-ui-tachie` |
| Stage 分支 | `Live2DScene`、`VRMScene`、`MMDScene`、`SpineScene`、`TachieScene` 及其懒加载 |
| 设置页 | `model-settings` 下的 live2d / vrm / mmd / spine / tachie 面板 |
| 开发者工具 | Live2D 动作提示词、VRM 位置校准、MMD 动作调试 |
| 资源 | 预设 Live2D、预设 VRM、构建期下载脚本 |
| 依赖 | pixi、cubism、three、@moeru/three-mmd、spine 运行时 |
| 测试 | 对应渲染器的单测、浏览器测试、故事文件 |

### 5.2 修改

| 文件 | 改动 |
| --- | --- |
| `packages/stage-ui/src/stores/display-models.ts` | 格式枚举收敛为 `animation-zip`，导入入口改为 ZIP |
| `packages/stage-ui/src/stores/settings/stage-model.ts` | `StageModelRenderer` 收敛为 `animation` |
| `packages/stage-ui/src/components/scenes/Stage.vue` | 只保留动画分支，情绪与动作改为意图分发 |
| `packages/stage-ui/src/components/scenarios/dialogs/model-selector/model-selector.vue` | 只保留 Animation ZIP |
| `packages/stage-ui/src/services/avatar-model.ts` | 头像类型收敛 |
| `packages/stage-ui/src/types/avatar-model.ts` | 同上 |
| `packages/core-character/src/avatar-model.ts` | 公开类型收敛，需 ADR |
| `packages/i18n` | 删除旧文案，新增动画包文案 |
| `packages/stage-ui/src/stores/character.ts` | 清理渲染器相关字段 |
| `server/apps/api` | 角色 schema 格式枚举改为 `animation-zip` |
| 根 `pnpm-workspace.yaml` / 各 `package.json` | 移除 live2d/three/mmd/spine/tachie 依赖 |

### 5.3 新增

| 文件 | 作用 |
| --- | --- |
| `packages/character-animation/package.json` | 新核心包，导出纯逻辑 |
| `packages/character-animation/src/types.ts` | `LoadedPack`、`Clip`、`AnimationIntent`、端口接口 |
| `packages/character-animation/src/schema.ts` | Valibot manifest schema |
| `packages/character-animation/src/manifest.ts` | 校验、解析、路径归一 |
| `packages/character-animation/src/picker.ts` | 权重抽取、避免重复、强度分档 |
| `packages/character-animation/src/state.ts` | 播放状态机，不依赖 DOM |
| `packages/character-animation/src/contracts.ts` | Eventa 跨进程契约（`playAnimation / setIntent / getSnapshot / pause / resume`） |
| `packages/stage-ui/src/adapters/animation/zip-loader.ts` | JSZip 解压、Blob URL、预加载 |
| `packages/stage-ui/src/adapters/animation/preview.ts` | 预览图生成 |
| `packages/stage-ui/src/adapters/animation/store.ts` | IndexedDB 实现 `AnimationPackStore` |
| `packages/stage-ui/src/components/scenes/VideoAnimationScene.vue` | 渲染器适配，实现 `AnimationPlayerPort` |
| `packages/stage-ui/src/stores/animation-settings.ts` | 动画包独立设置，不混入 stage-model |
| `packages/stage-ui/src/components/scenarios/settings/model-settings/animation.vue` | 动画包设置页 |

---

## 6. 数据迁移与公开契约

这是替换方案中风险最高的部分，必须先做 ADR。

### 6.1 本地数据

- IndexedDB 中旧的 `live2d-zip` / `vrm` / `mmd-zip` / `spine-zip` / `tachie-zip` 记录：标记 `unsupported`，不自动删除。
- 设置页显示“该模型格式已停用”，提供删除按钮。
- 当前选中模型若失效，回退到第一个动画包；没有动画包则显示空状态。

### 6.2 云端数据

- 云端同步保留旧记录，但客户端不再拉取。
- 新格式 `animation-zip` 需要服务端枚举与存储路径支持。
- 旧记录不迁移、不转换。

### 6.3 角色卡

- 新卡只允许 `animation` 头像类型。
- 旧卡导入时若头像类型是旧格式，保留文本字段，头像显示占位图。
- 卡片 schema 版本号 +1，并在 ADR 中说明。

### 6.4 服务端 schema

- `server/apps/api` 的角色与显示模型枚举需要单独 ADR。
- 建议一次性改成 `animation-zip`，不做双格式长期兼容。
- 迁移脚本只处理枚举值，不处理二进制资源。

---

## 7. 验证计划

### 7.1 自动化

- `pnpm -F @proj-aipets/character-animation exec vitest run`
- `pnpm -F @proj-aipets/stage-ui typecheck`
- `pnpm -F @proj-aipets/stage-ui exec vitest run src/adapters/animation`
- `pnpm -F @proj-aipets/stage-ui exec vitest run src/stores/animation-settings.test.ts`
- 改共享类型后跑根目录 `pnpm typecheck`
- 收尾跑 `pnpm lint`

### 7.2 手动矩阵

| 场景 | 期望 |
| --- | --- |
| 导入合法动画包 | 出现在列表，带预览图 |
| 导入缺 idle 的包 | 报错并指出原因 |
| 空闲 | idle 链按权重轮换，无白帧 |
| 说话 | 切 talk，结束后回 idle |
| 情绪消息 | 播对应情绪片段，强度选档 |
| 点击角色 | 播 click 片段 |
| 暂停/恢复 | 画面停住并继续 |
| 截图 | 输出透明背景图片 |
| 删除动画包 | 当前模型回退，不崩溃 |
| 旧模型记录 | 显示已停用，不崩溃 |

### 7.3 回归重点

- 语音链路：说话开始/结束必须正确切换 talk。
- 情绪队列：连续多条情绪不能堆积或错乱。
- 截图与 Polaroid：`captureFrame` 必须仍可用。
- 桌面端多窗口：动画状态同步不能出现双播。
- 性能：1080p 透明视频双缓冲在低端设备上的帧率。

---

## 8. 风险与待确认

### 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 透明视频兼容性 | Safari 需要 HEVC MOV | 提供双格式，按 UA 选择 |
| 素材体积 | 一个包可能上百 MB | 限制 200 MB，导入时提示 |
| 自动播放限制 | 浏览器阻止有声自动播放 | 强制 muted + playsinline |
| 内存占用 | 双 video + Blob URL | 只预加载当前包，切包释放 |
| 服务端契约 | 云端同步与角色卡失效 | 先写 ADR，再改 schema |
| 能力回退 | 用户习惯了 Live2D 口型 | 明确公告，提供 talk 片段规范 |

### 需要你确认的事项

1. 是否接受视频方案的能力上限：无实时口型、无连续表情强度、无视线跟随、无骨骼物理。
2. 旧本地/云端模型数据：标记不可用，还是直接删除。
3. 是否一次性完成 Phase 1–3（大改、单 PR），还是分阶段合并。
4. 动画包是否需要“口型叠加层”（本期默认不做）。

> Live2D 与 VRoid/VRM 路线已关闭，不再作为备选。

---

## 9. 明确不做

- 不保留多渲染器产品入口。
- 不改动对话、TTS、ASR、记忆、Provider、账号主链路。
- 不做视频实时抠像或运行时生成动画。
- 不做 Live2D/VRM 到视频的自动转换工具（可作为独立后续项目）。
- 不引入新的通用工具库；ZIP 解析复用已有 `jszip`。
- 桌面宠物不包含游戏功能：不接入 Minecraft、Factorio 或其他游戏模块，也不做桌宠内的游戏玩法。
