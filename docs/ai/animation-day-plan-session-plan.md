# 桌宠日计划与会话动画计划书

- 状态：Phase 0–3 已实现，Phase 4 等待素材补齐
- 关联文档：
  - `docs/ai/animation-video-stage-plan.md`（透明视频动画包与渲染器）
  - `docs/ai/animation-ai-director-plan.md`（AI 导演、情绪、表演计划）
- 本期范围：`packages/character-animation` + `apps/stage-web-react`
- 不在本期：实时口型、React 端 ACT 解析、多角色同屏、云同步

## 1. 决策摘要

| 项目 | 决定 |
| --- | --- |
| 日计划形态 | 粗块 + 滚动细化，全天 6–10 个语义块 |
| 日计划生成时机 | 当天首次启动、会话结束、睡眠醒来、手动重排 |
| 重排节流 | 两次生成间隔 ≥ 10 分钟，只排剩余时间 |
| 会话超时 | 最后一次用户交互后 90 秒，可配置 |
| 会话内动作 | 导演规划动作序列，总时长 ≤ 70 秒 |
| 长动作打断 | 播完当前片段 → 播 end（约 5 秒）→ 进入目标状态 |
| 打断后恢复 | 不恢复，剩余时长丢弃 |
| end 语义 | 退场过渡，不是完成动作；缺失时直接淡出 |
| 说话期插播 | 仅句界，单条 ≤ 2 秒，禁止长动作 |
| 每轮动作指令 | 最多 4 条 |
| 导演动作来源 | 完整片段目录全量投放，暂不启用检索 |
| 等待期序列来源 | 会话导演同一次调用返回 `idle.steps` |
| 首帧动作 | 接受迟到，不做规则层与 ACT |
| 迟到处理 | 超过 2 秒的锚点丢弃，最多保留一条 |
| 会话内长动作上限 | 不超过剩余会话窗口，另设 70 秒序列预算 |
| 暂停/恢复计时 | 不实现 |

## 2. 背景与现状

已有能力：

- `packages/character-animation/src/state.ts`：基础链、一次性层、长期动作 start/loop/end、真实计时器、`dispose()`、`longActionStop`。
- `packages/character-animation/src/plan.ts`：表演计划与动作指令校验，支持 `durationSeconds`。
- `packages/character-animation/src/executor.ts`：按回复锚点排程、冷却、单槽队列。
- `apps/stage-web-react/src/animation/director.ts`：回复结束后调用导演，输出计划。
- `apps/stage-web-react/src/animation/director-bus.ts`：聊天面板与舞台之间的计划总线。
- `assets/<角色>/state/`：17 个长动作素材，命名 `<名称>-start.webm` / `<名称>-end.webm`，各 5 秒，loop 待补。

已确认的问题：

1. 只有 ambient 行为，没有「日计划」这一层，长动作只能由零散线索触发。
2. 没有会话状态机，点击、输入、语音之间的切换没有统一仲裁。
3. 导演在回复结束后才返回，`replyStart` 与句界锚点必然迟到。
4. 长动作被打断时直接切断，没有统一的退场过渡。
5. 没有 `waiting` 基础链，等待期只能用 idle 循环。

## 3. 目标与非目标

### 目标

- 一天的行为由日计划驱动，长动作占主体。
- 用户交互时平滑退场，进入会话状态，结束后重排剩余时间。
- 会话内允许长动作填充静默期，并保证被对话打断时统一收场。
- 动作指令数量、迟到、插播时长都有明确上限，避免动作堆积。

### 非目标

- 不做逐帧、逐句的实时口型。
- 不要求首帧动作零延迟。
- 不实现多角色同屏与跨角色共享计划。
- 不实现云同步与多端计划一致性。

## 4. 总体架构

```text
DayPlan（块级日程，持久化）
        ↓ 当前时间命中哪个块
SessionState（ambient / session）
        ↓ 会话内基础链与动作序列
AnimationController（waiting / talking / 长动作 + 一次性层）
        ↓
CrossfadeVideoPlayer（A/B 双 video）
```

层归属：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 日计划契约与校验 | `packages/character-animation/src/day-plan.ts` | 块、时间、动作引用、预算校验 |
| 会话状态机 | `packages/character-animation/src/session.ts` | 状态转换、超时、epoch、打断仲裁 |
| 动作序列 | `packages/character-animation/src/sequence.ts` | 顺序、预算截断、与长动作接线 |
| 导演与持久化 | `apps/stage-web-react/src/animation/` | 生成、缓存、恢复、日志 |
| 播放 | 现有 `state.ts` + 宿主 | 不改播放层职责 |

## 5. 日计划契约

### 5.1 结构

```json
{
  "planVersion": 1,
  "planId": "2026-10-26-main-1",
  "characterId": "main",
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-10-26T09:00:00+08:00",
  "expiresAt": "2026-10-27T00:00:00+08:00",
  "blocks": [
    {
      "id": "block-1",
      "startAt": "2026-10-26T09:00:00+08:00",
      "durationMs": 1500000,
      "kind": "long",
      "actionId": "写代码",
      "priority": 0.6,
      "interruptible": true
    },
    {
      "id": "block-2",
      "startAt": "2026-10-26T09:25:00+08:00",
      "durationMs": 180000,
      "kind": "short",
      "actionId": "伸懒腰",
      "priority": 0.3,
      "interruptible": true
    }
  ]
}
```

### 5.2 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `planVersion` | 是 | 固定为 1 |
| `planId` | 是 | 计划 epoch，用于丢弃过期的计时器回调 |
| `characterId` | 是 | 计划归属角色 |
| `timezone` | 是 | 生成时的时区，用于跨天与夏令时 |
| `generatedAt` / `expiresAt` | 是 | 计划有效区间 |
| `blocks[].startAt` | 是 | 块开始时间，ISO 8601 |
| `blocks[].durationMs` | 是 | 块时长，long 建议 5–20 分钟，short 建议 2–10 秒 |
| `blocks[].kind` | 是 | `long` / `short` |
| `blocks[].actionId` | 是 | 必须存在于当前包的 `longActions` 或 `actions` |
| `blocks[].priority` | 是 | 0–1，用户在场时低优先级块可被跳过 |
| `blocks[].interruptible` | 是 | 是否允许被会话打断 |

### 5.3 生成与细化规则

- 首次生成只输出全天粗块，不生成逐段细节。
- 距离下一个块开始 10 分钟时，允许一次细化调用，只补下一个块与过渡短动作。
- 生成输入：角色设定、情绪（valence/arousal/label）、睡眠度、当前时间、用户是否在场、已完成块、剩余时长、可用长动作清单与标签。
- 用户在场时，长动作权重乘以 0.5，短动作与环视类动作提升。
- 计划只允许追加或替换未来块，已开始的块不可修改。
- 超过 `expiresAt`、跨天、时区变化时计划作废。

### 5.4 触发与节流

| 触发 | 行为 |
| --- | --- |
| 当天首次启动 | 生成全天粗块 |
| 会话结束 | 重排剩余时间 |
| 睡眠醒来 | 重排剩余时间 |
| 手动重排 | 无条件重排，但同样受节流约束 |
| 距上次生成 < 10 分钟 | 不调用模型，沿用当前计划尾段 |

### 5.5 失败降级

- 未配置模型或请求失败：使用规则排程（从可用长动作里按标签轮转），不阻塞播放。
- 返回非法 JSON：整份丢弃，沿用上一份有效计划。
- 未知 `actionId`：丢弃该块，其余保留。
- 计划为空：退回 ambient 基础链。

## 6. 会话状态机

### 6.1 状态

| 状态 | 说明 |
| --- | --- |
| `ambient` | 执行日计划，无会话 |
| `entering` | 从 ambient 进入会话的过渡 |
| `waiting` | 等待用户输入，可播动作序列 |
| `listening` | 麦克风录音或键盘输入中 |
| `thinking` | 已发送，等待回复 |
| `talking` | 回复文字或语音播放中 |

### 6.2 转换

| 从 | 事件 | 到 | 动画行为 |
| --- | --- | --- | --- |
| `ambient` | 点击宠物 / 提交消息 / 开始语音 | `entering` | 长动作播完当前片段 → 播 end |
| `entering` | end 结束或无需 end | `waiting` | 进入 waiting 链 |
| `waiting` | 聚焦输入框 / 按下麦克风 | `listening` | 播一次 listening 微动作 |
| `listening` | 提交消息 | `thinking` | 进入 thinking 链 |
| `waiting` | 直接提交（无 listening） | `thinking` | 同上 |
| `thinking` | 回复开始 | `talking` | 进入 talk 链 |
| `talking` | 语音结束或文字完成 | `waiting` | 播 afterSpeech 动作后回 waiting |
| 任意会话态 | 最后一次交互后 90 秒 | `ambient` | 有长动作则播 end，重排计划 |

### 6.3 超时与 epoch

- 超时从「最后一次用户交互」起算，不从回复结束起算。
- 用户交互定义：点击宠物、提交消息、开始/结束语音输入、在输入框输入。
- 每次交互递增 `sessionEpoch`；计时器回调发现 epoch 不匹配就丢弃。
- 不使用后台常驻定时器；应用恢复时按 `now - lastInteractionAt` 补算。
- `sessionIdleTimeoutMs` 默认 90000，可配置。

## 7. 对话动作与动作指令

### 7.1 术语

一条动作指令（cue）表示：在某个时机、播哪个片段、多强、持续多久。

```json
{ "anchor": { "type": "sentence", "index": 2 }, "clipId": "歪头", "intensity": 0.8, "durationSeconds": 1.5 }
```

### 7.2 每轮预算

- 每轮回复最多 4 条指令。
- 同一片段 12 秒冷却，同一主标签 5 秒冷却（沿用执行器现值）。
- 说话期间只允许句界插播，单条 ≤ 2 秒。
- `talking` 与 `thinking` 期间禁止长动作。
- 没有对应片段时静默跳过，不阻塞语音。

### 7.3 迟到规则

导演在回复结束后才返回，因此：

| 情况 | 处理 |
| --- | --- |
| 锚点已过去 ≤ 2 秒 | 正常播放 |
| 锚点已过去 > 2 秒 | 丢弃 |
| 多条都超过 2 秒 | 只保留最近一条，其余丢弃 |
| `afterSpeech` / 静默动作 | 永不丢弃，优先执行 |

首帧动作接受迟到，不做规则层与 ACT 解析。

### 7.4 动作序列

会话静默期由导演规划一段序列，而不是单个动作。

```json
{
  "idle": {
    "steps": [
      { "kind": "short", "actionId": "看向用户" },
      { "kind": "long", "actionId": "放风筝", "durationMs": 40000 },
      { "kind": "short", "actionId": "伸懒腰" }
    ]
  }
}
```

规则：

- 步骤按顺序播放，不重叠。
- 序列总时长 ≤ `sessionIdleTimeoutMs - 20000`，默认 70 秒。
- 超预算时在步骤边界截断，不截断正在播的长动作。
- 长步骤走 start → loop 循环 → end，计时器控制 loop 预算。
- 任意用户输入终止序列：长步骤播完当前片段再播 end，短步骤直接切。
- 未知或重复片段直接丢弃，序列继续。

## 8. 长动作打断与计时器

| 事件 | 行为 |
| --- | --- |
| 计时器到时（自然结束） | 只发送结束请求，等当前片段播完，播 end，回基础链 |
| 会话进入 / 用户输入 | 播完当前片段，播 end（约 5 秒），进入 session |
| 短动作被新输入打断 | 播完当前片段，再执行新请求，不播 end |
| 显式停止 `longActionStop` | 播完当前片段，播 end |
| 没有 end 片段 | 播完当前片段后直接淡出，不阻塞交互 |
| 同时多个 end 请求 | 只播一个，后续直接过渡 |

规则：

- 打断后不恢复，剩余时长丢弃。
- 不实现暂停/恢复计时。
- `end` 是退场过渡，不承担「完成动作」语义。
- 所有计时器必须带 `planId` 或 `sessionEpoch`，切换时清理。
- 宿主卸载调用 `controller.dispose()`。
- 同一时刻只允许一个 end 在播。

## 9. 优先级与仲裁

| 优先级 | 来源 | 示例 |
| --- | --- | --- |
| 1 | 用户输入 | 点击、提交消息、语音 |
| 2 | 会话状态切换 | listening / thinking / talking |
| 3 | 回复内动作指令 | 句界、afterSpeech |
| 4 | 会话动作序列 | waiting 期的长/短动作 |
| 5 | 日计划块 | ambient 长动作 |
| 6 | 空闲自发 | ambient 短动作 |

高优先级事件发生时，低优先级动画必须按第 8 节规则收场。

## 10. 持久化与恢复

- 存储键：`aipets:react:character/<id>/day-plan`。
- 存储内容：计划、`planId`、最后交互时间、当前块进度、`updatedAt`。
- 启动恢复：
  - 计划跨天或过期：重新生成。
  - 计划有效：按当前时间定位块，并从块内偏移继续。
  - 会话已超时：直接回 ambient。
- 不使用依赖进程存活的定时器，全部按时间戳补算。

## 11. 素材需求

| 素材 | 状态 | 用途 |
| --- | --- | --- |
| 13 个长动作 `start` / `loop` / `end` | 已有，`manifest.json` 已登记 `longActions` | 日计划块与会话 filler |
| `waiting` 基础链 | 待补 | 会话等待 |
| `listening` 微动作 | 待补 | 聚焦输入、按下麦克风 |
| 句界短动作 1–2 秒 | 部分已有 | talking 插播 |

约束：

- `loop.durationMs` 只作为默认时长的兜底，真实预算由计时器控制。计时从 start 片段的第一帧开始，start 的时长计入预算。预算到时不会切断正在播的片段。
- `end` 允许 5 秒；若后续压到 1.5 秒，打断延迟同步下降。
- 长动作缺少 `loop` 时不登记 `longActions`，避免运行期报错。

## 12. 分阶段实施

### Phase 0：契约与校验

状态：已完成。

交付：

- `day-plan.ts`：结构与校验。
- `session.ts`：状态、事件、epoch 类型。
- `sequence.ts`：步骤类型与预算截断。
- 单元测试：非法块、跨天、超预算、未知动作。

验收：

- `pnpm -F @proj-aipets/character-animation test:run` 通过。
- 不改变现有播放行为。

### Phase 1：会话状态机与 waiting 链

状态：已完成。宿主层在 `apps/stage-web-react/src/animation/session-controller.ts`。

交付：

- 点击 / 输入 / 语音进入会话，长动作播 end 后进入 waiting。
- `waiting` 基础链接入 `AnimationController`。
- 90 秒超时、epoch、应用恢复补算。
- 会话结束时重排触发点。

验收：

- 长动作中点击宠物：5 秒内进入 waiting。
- 连续交互不会误触发超时。
- 合盖 10 分钟再打开，会话已结束且不出现补播。

### Phase 2：日计划生成与恢复

状态：已完成。`animation/use-day-plan.ts` 负责加载、生成、节流与恢复。

交付：

- 导演调用：粗块计划、剩余时间重排、10 分钟节流。
- 计划持久化与启动恢复。
- 用户在场时权重调整。

验收：

- 首次启动生成 6–10 个块。
- 会话结束重排后，已完成块不被重播。
- 模型失败时使用规则排程，播放不中断。

### Phase 3：动作序列与迟到处理

状态：已完成。序列执行在 `animation/waiting-sequence.ts`，迟到判定在 `arrival.ts`。

交付：

- waiting 期序列执行、预算截断、打断收场。
- 每轮 4 条指令、句界 ≤2 秒、迟到丢弃。
- 日志记录丢弃原因。

验收：

- 70 秒序列不超出会话窗口。
- 回复结束 3 秒后到达的计划不会连续补播多条动作。
- 句界插播不出现「动画结束、语音还在」的错位。

### Phase 4：素材与打磨

状态：等待素材。13 个长动作已登记并可用，`waiting` 与 `listening` 素材待补。

交付：

- 补齐 loop 片段与 waiting / listening 素材。
- 调整 end 长度、过渡淡入参数。
- 端到端剧本验证。

## 13. 测试计划

| 类型 | 内容 |
| --- | --- |
| 单元 | 计划校验、预算截断、迟到丢弃、epoch 竞态、超时补算 |
| 假时钟 | 会话超时、长动作计时、重排节流 |
| 集成 | 点击 → end → waiting → 提交 → talking → 90 秒 → ambient |
| 集成 | 序列执行中被输入打断，长动作收场且不恢复 |
| 手工 | 连续三条消息、长时间静默、合盖恢复、模型超时 |

## 14. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 打断延迟 5 秒 | 回复反馈变慢 | 接受；后续可缩短 end |
| 日计划漂移 | 行为与实际时间不符 | 滚动细化 + 10 分钟节流 |
| 计时器竞态 | 旧回调误触发 | planId / sessionEpoch 双重校验 |
| 动作堆积 | 迟到指令连续补播 | 2 秒丢弃规则 |
| 模型成本 | 频繁重排 | 节流 + 只排剩余时间 |
| 素材缺失 | 长动作不可用 | 未登记即不启用，降级 idle |

## 15. 明确不做

- 实时口型与逐帧同步。
- React 端 ACT 内联解析。
- 多角色共享日计划。
- 会话内的长动作叠播。
- 暂停与恢复长动作剩余时长。
- 跨设备计划同步。
