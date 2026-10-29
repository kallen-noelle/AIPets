# AI 主导的角色动画控制计划书

- 分支：`kallen/feat/ai-animation-director`
- 状态：Phase 0–3 已完成；Phase 4 待开始
- 关联文档：`docs/ai/animation-video-stage-plan.md`（透明视频动画包与渲染器替换）
- 本期范围：`packages/character-animation` + `apps/stage-web-react`
- 不在本期：Vue 遗留端、stage-tamagotchi、游戏对局接入、云同步

## 0. 决策摘要

| 项目 | 决定 |
| --- | --- |
| 控制权 | L2 共同导演为默认：AI 决定状态与线索，运行时负责安全、冷却、回退 |
| AI 决策位置 | 回复完成后一次独立导演调用，与语音并行，不阻塞文字输出 |
| 情绪表示 | valence / arousal 连续值 + 派生标签 + 好感度；驱动值单独一层 |
| 选片方式 | 语义片段目录 + 本地 Top-K 检索 + 白名单校验，替换跨全集加权随机 |
| 执行方式 | 保留现有状态机，新增显式片段播放与临时状态循环，外层加时间轴执行器 |
| 素材改造 | 改造 `scripts/build-character-packs.mjs`，移除单一 `happy` 桶，增加语义标注 |
| 时间与睡眠 | Phase 4 实现；天气只预留适配器，不实现 |
| 失败降级 | 导演失败时退回规则层和现有状态机，聊天与语音不受影响 |

## 1. 背景与问题

现有动画控制由 `packages/character-animation/src/state.ts`、`picker.ts`、`manifest.ts` 组成，React 宿主在 `apps/stage-web-react/src/components/character-stage.tsx`、`animation/video-player.ts`。

已确认的问题：

1. 决策只有三种基础链与加权随机，无法表达“为什么这样动”。
2. `emotion.happy` 由生成脚本把所有非点击片段塞在一起，语义错误。
3. AI、人设、对话内容均未参与动画决策；`AnimationIntent` 与 Eventa 契约无消费者。
4. `thinking` 只在调试按钮触发，生成期间没有派发。
5. 舞台的 `dispatch` 只存在于 `stage-page.tsx`，聊天面板无法触达。
6. `/chat` 路由没有 `CharacterStage`，在该页聊天时宠物不可见。
7. 无时间、天气、驱动值、模式等扩展点；状态机只有 idle/talk/thinking。

## 2. 目标与非目标

### 目标

- AI 依据人设、对话内容、情绪与场景状态，参与或主导动画选择。
- 动画片段与台词语义、时间轴对齐，不再从全集随机抽取。
- 情绪可持久化、可衰减、可解释、可调试。
- 为时间、天气、睡眠度、饥饿度、睡眠模式预留稳定契约。
- 导演不可用时，现有行为完全保留。

### 非目标

- 不做逐帧或逐拍的 LLM 控制。
- 不做游戏对局接入。
- 不实现天气数据源，只定义适配器接口。
- 不在本期实现饥饿度的实际效果，只预留字段。
- 不做多角色同屏、云同步、强化学习调参。
- 不改 Vue 遗留端与 stage-tamagotchi。

## 3. 设计原则

1. **AI 提案，本地持有状态。** 情绪与模式的事实源在本地，AI 只能提交有界增量和候选片段。
2. **规则优先，LLM 表达。** 阈值、强事件、安全、模式转换由规则决定；LLM 负责选择表现方式。
3. **语义优先。** AI 面向语义标签与片段目录，不直接猜文件路径。
4. **确定性执行。** 计划可检查、可回放；同一计划在假时钟下必须得到相同命令序列。
5. **随机只做质感。** 加权随机只保留在 AI 已选定的候选集内和降级路径中。

## 4. 总体架构

```text
适配器：时间 / 天气(预留) / 输入 / 语音 / 在场
        ↓ 归一化
世界事实 WorldFacts ── 角色状态 CharacterState（情绪 + 驱动 + 好感）
        ↓                         ↓ 时间戳补算
                    Mode 控制器（阈值、迟滞、最短停留）
                                  ↓
                    AI 导演（可选；人设 + 场景 + 候选片段）
                                  ↓ 表演计划 PerformancePlan
                    执行器（时间轴、优先级、冷却、去重）
                                  ↓ AnimationCommand
                    AnimationController + CrossfadeVideoPlayer
```

层归属：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 核心契约与纯逻辑 | `packages/character-animation` | 目录、状态、模式、计划校验、执行器、状态机 |
| AI 调用与检索 | `apps/stage-web-react/src/animation` | 导演请求、候选检索、提示词拼装 |
| 宿主渲染 | `apps/stage-web-react/src/components` | 视频播放、点击、拖拽、调试面板 |
| 素材生成 | `scripts/build-character-packs.mjs` | 语义目录、manifest、角色索引 |

## 5. 核心契约

### 5.1 语义片段目录 ClipDescriptor

每个角色包生成一份 `catalog.json`，与 `manifest.json` 同源。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定 id，默认等于归一化后的 `src` |
| `name` | string | 展示名，默认取文件名 |
| `description` | string | 一句话描述 |
| `tags` | string[] | 语义标签，例如 `shy`、`happy`、`comfort`、`sleepy` |
| `valence` | number | −1 ~ 1，片段本身的情绪色彩 |
| `arousal` | number | 0 ~ 1 |
| `role` | `loop` \| `oneShot` \| `transition` | 适合的播放方式 |
| `durationMs` | number? | 已知时长，未知时留空 |
| `source` | `manifest` \| `inferred` \| `manual` | 语义来源，便于排查 |

目录要求：

- `catalogVersion: 1`、`packId`、`generatedAt`。
- 所有片段必须存在且通过路径校验。
- 人工覆盖优先于自动推断。
- 导入 ZIP 时若包内没有 `catalog.json`，首次加载在本地生成并缓存到 IndexedDB。

### 5.2 角色表演设定 CharacterPerformance

每个角色一份，编译期生成，运行期只读。

| 字段 | 说明 |
| --- | --- |
| `personaSummary` | 人设摘要，供导演使用 |
| `baselineValence` / `baselineArousal` | 情绪基线 |
| `sensitivity` | 事件敏感度系数 |
| `expressiveness` | 动作频率与强度系数 |
| `shyness` / `pride` | 人设特质，用于标签覆盖 |
| `preferredTags` | 优先标签 |
| `forbiddenTags` / `forbiddenActions` | 禁用表现 |
| `labelOverrides` | 标签覆盖，例如同一事件下 character2 映射为 `proud` |
| `maxCuesPerReply` | 默认 3 |

首批数据写在 `assets/<id>/config.json`，由生成脚本汇总。

### 5.3 状态分层

| 类别 | 字段 | 变化规律 |
| --- | --- | --- |
| 情绪 Affect | `valence`、`arousal`、`label` | 快变，向基线衰减 |
| 驱动 Drives | `sleepiness`、`hunger`（预留）、`energy`（预留） | 慢变，随时间累积，由行为重置 |
| 关系 Affinity | `affinity` | 长期累计，本期不衰减 |
| 世界事实 WorldFacts | `now`、`isNight`、`userPresent`、`idleMinutes`、`locale` | 外部输入，不持久化计算结果 |

持久化键：`aipets:react:character/<id>/state`，带 `version` 与 `updatedAt`。版本不匹配时重置为基线。

### 5.4 Mode

首期只实现三个模式：`awake`、`sleepy`、`sleeping`。

| 模式 | 进入条件 | 退出条件 |
| --- | --- | --- |
| `awake` | 默认 | 满足 sleepy 条件 |
| `sleepy` | 睡眠度 ≥ 0.75，或夜间且空闲 ≥ 20 分钟 | 睡眠度 ≥ 0.95 进入 sleeping；睡眠度 < 0.55 回到 awake |
| `sleeping` | 夜间 + 睡眠度 ≥ 0.90 + 空闲 ≥ 10 分钟；或睡眠度 ≥ 0.95 | 用户点击、发消息、语音唤醒；早晨；睡眠度 < 0.25 |

规则：

- 每个模式设置最短停留时间，`sleeping` 默认 10 分钟，用户交互可立即打断。
- 阈值使用迟滞，避免睡前反复切换。
- `sleeping` 期间关闭环境导演调用，只处理唤醒事件。
- 情绪不能直接进入睡眠模式；模式由驱动、时间、交互决定。
- 睡眠片段缺失时降级为 `idle`，不阻塞模式。

### 5.5 表演计划 PerformancePlan

导演输出，Valibot 校验。

| 字段 | 说明 |
| --- | --- |
| `affect` | `{ valence: −0.10 ~ +0.10, arousal: −0.08 ~ +0.08 }` |
| `cues` | 最多 3 条，可空 |
| `ambient` | 可选，空闲候选片段 id 列表 |

单条线索：

| 字段 | 说明 |
| --- | --- |
| `anchor` | `replyStart` \| `sentence` + 序号 \| `afterSpeech` \| `silence` + 秒 |
| `clipId` | 必须存在于候选集 |
| `intensity` | 0 ~ 1 |
| `reason` | 仅调试与日志 |
| `priority` | 可省略，默认按来源 |

不允许绝对毫秒时间戳。当前 TTS 是整段合成后播放，时长事先不可知。

### 5.6 命令扩展

在现有 `AnimationCommand` 之外新增：

| 命令 | 作用 |
| --- | --- |
| `playSpecificClip` | 显式播放指定片段，绕过加权选择 |
| `setState` | 设置临时基础循环，one-shot 结束后回到它 |
| `clearState` | 清除临时状态，回到 manifest 基础链 |

现有 `dispatch`、`clipEnded`、暂停恢复语义保持不变。

## 6. 情绪控制细则

### 6.1 写入源与优先级

| 来源 | 示例 | 权限 |
| --- | --- | --- |
| 规则事件 | 被夸、被骂、道歉、雷雨（预留） | 确定增量，可锁定符号 30 秒 |
| 用户交互 | 点击、拖拽、停止对话 | 小幅增量 |
| AI 导演 | 结合上下文提议 | valence ±0.10，arousal ±0.08 |
| 时间 | 衰减与离线补算 | 回归基线 |

### 6.2 初始参数

| 参数 | 默认值 |
| --- | --- |
| 基线 | main `(+0.20, 0.45)`；character2 `(+0.10, 0.50)`；其余按人设微调 |
| 单轮上限 | valence ±0.20，arousal ±0.15 |
| 单事件上限 | valence ±0.35 |
| 半衰期 | valence 60 分钟，arousal 20 分钟 |
| 标签迟滞 | 0.08 |
| 标签最短停留 | 30 秒；只约束相邻标签对，跨类切换立即生效 |
| 好感每轮 | 最多 +2 / −3，范围 0 ~ 100 |

规则增量示例：

| 事件 | valence | arousal | 备注 |
| --- | --- | --- | --- |
| 夸奖 | +0.12 | +0.05 | 人设敏感度系数缩放 |
| 批评 | −0.35 | +0.06 | main 偏 sad，character2 偏 angry |
| 道歉 | +0.08 | −0.02 | 仅当上轮为负面 |
| 点击 | +0.02 | +0.02 | 需冷却 |
| 15 分钟无交互 | −0.02 | −0.01 | 每 15 分钟一次 |
| 长时间对话 | 0 | +0.01 | 只影响好感 |

### 6.3 标签派生

| 条件 | 标签 |
| --- | --- |
| valence ≥ 0.45 且 arousal ≥ 0.55 | `excited` |
| valence ≥ 0.45 且 arousal < 0.55 | `content` |
| valence ≤ −0.10 且 arousal ≥ 0.55 | `angry` |
| valence ≤ −0.10 且 arousal < 0.55 | `sad` |
| 睡眠度 ≥ 0.75 或模式为 sleepy | `sleepy` |
| valence ≥ 0.20、arousal 0.30 ~ 0.60、shyness ≥ 0.6 | `shy` |
| valence ≥ 0.30 且 pride ≥ 0.6 | `proud` |

人设覆盖优先于通用映射。规则顺序为 sleepy → proud → excited → shy → content → angry → sad → calm。只有 content/excited 与 sad/angry 这两对相邻标签受最短停留约束。

### 6.4 合并顺序

1. 规则增量。
2. 导演增量。
3. 单轮限幅。
4. 接近边界时按 `1 − |value| × 0.5` 压缩增益，最低保留 0.35。
5. 全局范围裁剪。
6. 派生标签并做迟滞判断。

导演不能反转被规则锁定的符号。用户文本按不可信输入处理，不得直接提升上限。

### 6.5 情绪如何影响动画

1. **即时反应**：事件强度决定 one-shot 强度；强度 ≥ 0.6 走 high 档。
2. **空闲基线**：标签与 VA 决定候选片段集合和自发动作概率；加权只在候选集内生效。
3. **说话期间**：不改变 talk 链，只调整动作频率与强度。
4. **模式**：情绪只影响模式内表现，不决定睡眠、进食等模式转换。

## 7. 运行时流程

### 7.1 每个对话回合

1. 用户输入到达，存储 `lastInteractionAt`。
2. 反射层在 150ms 内给一个微反应，不等待模型。
3. 主回复开始流式生成，派发 `thinking`。
4. 回复完成，并行触发导演调用与 TTS。
5. 规则层计算硬增量；导演返回计划。
6. 合并、限幅、刷新标签。
7. 执行器按锚点排程。
8. 回合结束持久化状态。

### 7.2 空闲与环境

- 空闲调度器每 5 分钟检查一次，满足条件时允许一次“环境导演”调用。
- `sleeping` 模式关闭环境调用。
- 用户回来时先派发唤醒反应，再恢复环境行为。

### 7.3 启动与补算

- 启动读取持久化状态，按 `updatedAt` 与当前时间补算衰减与驱动累积。
- 不依赖后台常驻定时器；应用休眠、跨天、关闭都按时间戳补算。
- 使用 `AnimationClockPort` 注入时钟，测试可替换。

## 8. 导演调用规范

### 8.1 输入

- 角色表演设定。
- 情绪摘要：VA 数值 + 标签 + 好感 + 最近 3 个事件。
- 世界事实：夜间、空闲分钟、用户在场。
- 最近 2 轮对话与当前回复文本。
- 候选片段：本地检索 Top-20，附名称、描述、标签、VA、role。
- 约束：最多 3 条线索、禁止标签、可用锚点。

### 8.2 输出与校验

- 只接受 JSON；Valibot 校验失败则整份计划丢弃。
- 单条线索的 `clipId` 不在候选集时丢弃该条；全部丢弃则回退。
- 线索数量、增量上限、锚点合法性逐项校验。
- 记录 `reason` 与丢弃原因，供调试面板展示。

### 8.3 调用参数

| 项目 | 默认 |
| --- | --- |
| 模型 | 用户单独选择，允许与聊天模型不同 |
| 超时 | 2 秒 |
| 重试 | 不重试，避免叠加延迟 |
| 触发 | 每个助手回合一次；过短回复可跳过 |
| 并行 | 与 TTS 并行，绝不阻塞文字 |
| 关闭 | 未配置模型时自动关闭，只走规则层 |

### 8.4 候选检索

- 查询词：用户文本 + 回复文本 + 标签 + 模式。
- 打分：标签重合、VA 距离、role 兼容、人设偏好。
- 取 Top-20，并强制包含当前模式循环片段。
- 检索在本地完成，不额外调用模型。

## 9. 执行与仲裁

| 规则 | 默认 |
| --- | --- |
| 优先级 | 用户点击 > 计划动作 > 计划表情 > 空闲自发 |
| 同片段冷却 | 12 秒 |
| 同标签冷却 | 5 秒 |
| 每轮线索上限 | 3 |
| 等待队列 | 1 个，TTL 3 秒 |
| 说话期间 | 允许 one-shot 插播，结束后回到 talk 链 |
| 暂停 | 冻结排程，恢复后不重置进度 |
| 唤醒打断 | 点击或消息立即打断睡眠，清空待执行线索 |

锚点实现：

- `replyStart`：首字出现或 TTS 开始。
- `sentence`：按标点切句，用字符数比例映射到音频时长；无 TTS 时用文本进度。
- `afterSpeech`：音频结束或文本完成 600ms 后。
- `silence`：最后一次交互后的静默秒数。

Phase 1 采用比例估算，Phase 5 可选分句 TTS 提升精度。

## 10. 素材管线改造

### 10.1 现状

`scripts/build-character-packs.mjs` 将所有非点击片段写入 `emotion.happy`，并把中文名复制为 `actions`。这会导致 AI 选择 `happy` 时播放语义不符的片段。

### 10.2 改造内容

1. 在 `assets/<id>/config.json` 增加 `semantics` 映射：

```json
{
  "semantics": {
    "点击回应-害羞惊讶": {
      "description": "被夸奖后低头、缩肩",
      "tags": ["shy", "happy", "comfort"],
      "valence": 0.45,
      "arousal": 0.55,
      "role": "oneShot"
    }
  }
}
```

2. 生成器输出 `catalog.json`，并按标签派生 `emotions` 分组，不再写死 `happy`。
3. 提供独立脚本 `scripts/enrich-character-semantics.mjs`，可选批量调用 LLM 根据文件名生成初稿；网络调用不进入默认构建流程。
4. 人工标注覆盖自动推断；缺失语义时回退文件名推断，并标记 `source: inferred`。
5. `manifest` schema 暂不改；Phase 4 再评估是否增加 `states`。

### 10.3 五个角色

- `main`、`character2`、`character3`、`character4`、`character5` 全部补齐语义。
- 优先补齐：`shy`、`happy`、`sad`、`angry`、`sleepy`、`comfort`。
- 缺失类别的片段不得伪造标签；宁可不选，也不硬凑。

## 11. 宿主接线

### 11.1 意图总线

新增 `apps/stage-web-react/src/animation/director-bus.ts`，沿用 `speech/playback.ts` 的模块级单例模式：

- `emitPlan(plan)`、`emitAffect(snapshot)`、订阅 hook。
- 聊天面板与舞台通过总线通信，不依赖组件树。
- Eventa 契约保留给将来的桌面宿主，本期不接入。

### 11.2 聊天面板

- 生成开始派发 `thinking`。
- 回复完成调用导演，拿到计划后 `emitPlan`。
- TTS 开关不影响导演；但导演关闭时不发计划。

### 11.3 舞台

- 包加载完成注册目录与能力集。
- 订阅计划，先做白名单与能力过滤，再交给执行器。
- 调试面板展示 VA、标签、模式、计划、已执行与丢弃原因。

### 11.4 `/chat` 路由

本期不在 `/chat` 增加舞台；该页聊天不驱动物理可见动画。是否增加紧凑舞台或全局悬浮层，留到 Phase 5 决定。

### 11.5 设置页

Phase 3 增加“动画导演”设置：开关、模型选择、控制权级别、最大线索数、调试面板开关。文案只改英文与简体中文。

## 12. 控制权分级

| 级别 | AI 权限 | 运行时权限 |
| --- | --- | --- |
| L0 | 关闭 | 现有状态机 |
| L1 建议 | 只提交高置信线索 | 采纳或否决 |
| L2 共同导演（默认） | 状态表现与线索计划 | 安全、冷却、打断、回退 |
| L3 主导 | 可提议模式内的全部表现 | 只保留安全、模式规则与失败回退 |

L3 不允许越过规则层的模式转换、增量上限与禁用清单。

## 13. 降级与失败

| 情况 | 行为 |
| --- | --- |
| 未配置导演模型 | 规则层 + 现有状态机，无报错 |
| JSON 非法 | 整份计划丢弃，记录原因 |
| 片段不存在或不在候选集 | 丢弃该条，其余继续 |
| 超时或请求失败 | 丢弃计划，聊天与 TTS 不受影响 |
| 情绪值异常 | 裁剪到合法范围；NaN 重置为基线 |
| 候选为空 | 只用现有链，不播 one-shot |
| 模式片段缺失 | 降级为 idle，保留模式状态 |

## 14. 分阶段实施计划

### Phase 0：契约冻结

交付：

- `catalog.ts`、`affect.ts`、`modes.ts`、`plan.ts` 类型与 Valibot 校验。
- 假时钟与固定夹具。
- 单元测试覆盖校验、边界与非法输入。

验收：

- `pnpm -F @proj-aipets/character-animation test:run` 通过。
- `pnpm -F @proj-aipets/character-animation typecheck` 通过。
- 不改变现有播放行为。

### Phase 1：语义目录与显式播放

交付：

- 素材语义标注与 `catalog.json` 生成。
- `playSpecificClip`、`setState`、`clearState`。
- 时间轴执行器骨架，支持 `replyStart`、`sentence`、`afterSpeech`。
- 调试入口：手动注入计划 JSON。

验收：

- 指定计划能按锚点播放精确片段，交叉淡入正常。
- 旧 `dispatch` 路径与现有测试不回归。

### Phase 2：情绪与规则层

交付：

- Affect 状态、规则增量、衰减与离线补算、标签迟滞。
- 按角色持久化。
- 情绪影响空闲候选与动作频率。
- 调试面板显示 VA、标签、增量来源。

验收：

- 三次夸奖后标签为 `excited`；被批评后 main 为 `sad`、character2 为 `angry`。
- 关闭应用 8 小时后恢复，情绪按时间衰减。
- 无导演调用也能完整运行。

### Phase 3：AI 导演

交付：

- 候选检索、导演提示词、请求与校验。
- 意图总线、聊天面板接线、舞台订阅、`thinking` 接线。
- 设置页：开关、模型、控制权、最大线索数。
- L2 仲裁。

验收：

- 夸奖、批评、技术求助三类剧本产生符合人设的计划。
- 导演超时或返回非法 JSON 时无可见故障。
- 每轮新增 token 成本可统计，且有上限。

### Phase 4：模式、时间与睡眠

交付：

- 时间适配器、睡眠度驱动、模式控制器。
- 夜间进入 `sleeping`，循环睡眠片段；点击、消息、早晨唤醒。
- 唤醒过渡与最短停留、迟滞。

验收：

- 模拟 23:00 + 空闲 + 睡眠度达标 → 进入睡眠循环。
- 点击立即唤醒并播过渡。
- 跨天启动按时间戳补算，不出现二次入睡抖动。

### Phase 5：可选增强

- 天气适配器。
- 分句 TTS 与精确句级锚点。
- 流式内联动画标签。
- `/chat` 紧凑舞台或全局悬浮层。
- 计划与执行日志、指标看板。

## 15. 测试计划

| 类型 | 内容 |
| --- | --- |
| 单元 | 目录校验、计划校验、情绪合并/限幅/衰减、标签迟滞、执行器锚点/优先级/冷却、模式转换 |
| 黄金剧本 | 夸奖、批评、技术求助、夜间睡眠、导演失败 |
| 假时钟 | 离线补算、跨天、衰减、最短停留 |
| 集成 | 计划 JSON → 命令序列 → 播放器桩 |
| 手工视觉 | 舞台实际播放、点击打断、睡眠循环、唤醒 |

命令：

```sh
pnpm -F @proj-aipets/character-animation test:run
pnpm -F @proj-aipets/character-animation typecheck
pnpm -F @proj-aipets/stage-web-react typecheck
pnpm lint
```

## 16. 验收指标

- 语义匹配率：计划片段与台词语义一致的比例。
- 重复率：同一片段 10 分钟内重复次数。
- 打断率：计划线索被用户点击或语音打断的比例。
- 首反应延迟：用户输入到第一个可见动作。
- 每轮额外成本：导演调用的 token 与耗时。
- 稳定性：导演失败、非法输入、空候选下的无故障率。

## 17. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 语义标注质量差 | AI 选片错误 | 人工覆盖、黄金剧本回归 |
| 候选检索漏召回 | 好片段进不了候选 | 标签别名、强制包含模式片段 |
| Prompt 膨胀 | 成本与延迟上升 | Top-K、上下文预算、缓存设定集 |
| 模式抖动 | 睡前反复切换 | 迟滞、最短停留、唤醒冷却 |
| TTS 时间不可知 | 句级锚点偏移 | 比例估算，后续分句合成 |
| 导演延迟 | 开场无动作 | 反射层兜底，线索后移 |
| 情绪被用户话术操控 | 人设失真 | 上限、符号锁定、不可信输入处理 |
| 跨路由无舞台 | 聊天页无动画 | 本期接受，Phase 5 再评估 |

## 18. 默认决策与待确认

已按默认值写入本计划，评审时可调整：

1. 控制权默认 L2。
2. 导演使用独立模型调用，未配置时关闭。
3. 语义标注以人工为主，批量 LLM 仅作初稿。
4. 候选检索本地完成，不依赖 tool call。
5. 句级锚点先按比例估算，分句 TTS 延后。
6. 流式内联标签不进 v1。
7. `/chat` 本期不增加舞台。
8. 饥饿度只预留字段，不实现效果。
9. 天气只预留适配器，不实现数据源。

## 19. 实施记录

Phase 0 已完成：

- 新增 `catalog.ts`、`affect.ts`、`modes.ts`、`plan.ts` 与 Valibot 校验。
- 新增对应单元测试，覆盖目录解析、情绪增减与衰减、模式转换、计划校验。
- `pnpm -F @proj-aipets/character-animation test:run` 通过，54 个测试。
- `pnpm -F @proj-aipets/character-animation typecheck` 通过。

Phase 1 已完成：

- `AnimationController` 支持 `playClip`、`setState`、`clearState`。
- 新增 `PerformancePlanExecutor`，支持回复锚点、句级锚点、语音结束、静默锚点、冷却、单槽队列、暂停与打断。
- 生成脚本输出 `assets/<id>/catalog.json`，并按语义标签生成 `emotion` 分组，替换原来的单一 `happy` 桶。
- 五个角色均已生成 catalog；`main` 与 `character2`、`character5` 增加了人工语义覆盖。
- React 宿主可加载 catalog，舞台提供计划 JSON 调试入口。
- `pnpm -F @proj-aipets/stage-web-react typecheck` 通过。
- 开发服务器已验证 catalog 与 manifest 可访问。
- 已用 Playwright 无头浏览器验证实际播放：debug 计划在 replyStart 播放害羞片段，sentence 1 切换开心片段，afterSpeech 切换行礼片段。
- 执行器对更晚锚点的线索采用替换而不是排队，避免长片段跨过下一个锚点后才播放。

Phase 2 已完成：

- 新增 `apps/stage-web-react/src/character/affect-store.ts`，按角色持久化情绪到 `aipets:react:character/<id>/affect`。
- 每个角色有独立基线与特质；支持夸奖、批评、道歉、点击、对话与 5 分钟衰减。
- 启动时按 `updatedAt` 补算离线衰减。
- 聊天输入接入本地规则词表；点击舞台也会更新情绪。
- 空闲行为按情绪标签选择候选片段，并调整触发间隔。
- 调试面板显示 mood、valence、arousal、affinity，并提供 Praise、Scold、Reset mood 按钮。

实测结果：

- main 连续三次夸奖：`shy → shy → excited`，valence 0.20 → 0.53，arousal 0.45 → 0.60。
- main 重置后批评：`sad`，valence −0.11，arousal 0.51。
- character2 重置后批评：`angry`，valence −0.20，arousal 0.55。
- character2 的 `updatedAt` 回拨 8 小时后重载：`angry` 衰减为 `calm`，valence −0.20 → 0.10，arousal 0.55 → 0.50。
- 本地规则词表：`你真可爱/谢谢你 → praise`，`你好笨 → insult`，`你不笨 → null`，`对不起 → apology`。

Phase 3 已完成：

- 新增 `director-bus.ts`、`director.ts`、`retrieval.ts`、`director-config.ts`。
- 聊天回复完成后并行请求导演模型，2.5 秒超时，不阻塞文字与语音。
- 候选检索按情绪标签、关键词、VA 距离和片段类型排序，只把 Top-20 交给模型。
- 导演输出经过 Valibot 与片段白名单校验，非法 JSON、未知片段、超时全部静默丢弃。
- 聊天开始与结束派发 `thinking` 事件，舞台通过总线订阅。
- 舞台订阅表演计划，重新校验后执行，并把导演的情绪增量写入 affect store。
- 新增 `/settings/animation` 设置页：开关、导演模型、控制级别、最大线索数。
- L1 只保留强度 ≥ 0.7 的线索并移除情绪增量；L2 为默认；L3 最多允许四条线索。

实测结果（使用拦截后的模拟 provider，避免真实计费）：

- 聊天请求模型 `mock-chat`，导演请求模型 `mock-director`。
- 回复完成后按 `replyStart → sentence 1 → afterSpeech` 播放害羞、开心、行礼片段，触发时间约 170ms、1415ms、3748ms。
- 导演情绪增量写入后，角色保持 `excited`。
- 空闲调度在约 7.6 秒后按 `excited` 标签播放了《荡秋千》。

尚未完成：

- Phase 4 的时间适配器、睡眠度驱动与睡眠模式尚未开始。

Phase 3 修复（实测后）：

- 新增 `animation/animation-log.ts` 与 `components/animation-log-panel.tsx`。舞台页展示从聊天到视频的每一段链路，缺失的阶段即断点。
- 导演超时从 2.5 秒改为 15 秒。云端模型无法在 2.5 秒内返回 JSON，原值会导致全部计划被丢弃。
- 修正重复点击已选中角色会清空 catalog 的问题。`CharacterStage` 的 `manifestUrl` 不变时不会重新加载，`onReady` 不再触发，catalog 会永久为 null。
- 检索新增变装、换装、变身、舞蹈关键词，命中 `perform`、`vanity`、`magic` 标签。
- 导演默认开启。

实测结果：

- 发送「请你进行变装」后，导演返回计划并播放 `animations/整体换装试色.webm`。
- 日志可见完整链路：`run → requestPerformancePlan → LLM responded → parsed JSON → plan accepted → bus emitPlan → executor anchor → stage play clip`。

已知限制：

- `/chat` 路由没有舞台，`directorBus` 上下文不激活，在该页聊天不会驱动物理可见动画。

## 20. 计划文件清单

核心包：

- `packages/character-animation/src/catalog.ts`
- `packages/character-animation/src/affect.ts`
- `packages/character-animation/src/modes.ts`
- `packages/character-animation/src/plan.ts`
- `packages/character-animation/src/executor.ts`
- 更新 `types.ts`、`state.ts`、`manifest.ts`、`index.ts`
- 对应单元测试

素材与脚本：

- `scripts/build-character-packs.mjs`
- `scripts/enrich-character-semantics.mjs`（可选）
- `assets/<id>/config.json` 语义标注
- `assets/<id>/catalog.json`（生成物）

React 宿主：

- `apps/stage-web-react/src/animation/director-bus.ts`
- `apps/stage-web-react/src/animation/director.ts`
- `apps/stage-web-react/src/animation/retrieval.ts`
- `apps/stage-web-react/src/animation/executor.ts`
- 更新 `components/character-stage.tsx`、`components/chat-panel.tsx`、`pages/stage-page.tsx`
- 新增设置页与 `packages/i18n` 文案（英文 + 简体中文）

文档：

- 本计划书
- 如实现与计划有偏差，在 Phase 结束前补一份 ADR
