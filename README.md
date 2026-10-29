<picture>
  <source
    width="100%"
    srcset="./docs/assets/banner-dark-1280x640.avif"
    media="(prefers-color-scheme: dark)"
  />
  <source
    width="100%"
    srcset="./docs/assets/banner-light-1280x640.avif"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img width="250" src="./docs/assets/banner-light-1280x640.avif" />
</picture>

<h1 align="center">aipets</h1>

<p align="center">一只住在你桌面上的会说话的数字宠物。</p>

<p align="center">
  [<a href="./README.md">简体中文</a>] [<a href="./docs/README.en.md">English</a>]
</p>


## 这个项目做什么

一只数字宠物住在你的屏幕上，和你说话。大语言模型写出回复，语音模型把回复念出来，视频播放器在透明窗口里
播放对应的身体动画。

身体不是 3D 模型。每一个可见动作都是一段透明的短视频片段。会话决定下一段播什么，交叉淡入播放器在两个
video 元素之间切换，所以宠物不会卡在切换的瞬间。

## 开发

```shell
pnpm install
pnpm dev:web
```

### 桌面端

```shell
pnpm -F @proj-aipets/stage-web-react dev       # Vite 开发服务器
pnpm -F @proj-aipets/stage-web-react electron  # 在开发服务器上打开 Electron 窗口
```

构建 Windows 安装包：

```shell
pnpm -F @proj-aipets/stage-web-react electron:dist
```

安装包输出到 `apps/stage-web-react/release/`，该目录不纳入版本管理。

### 角色资源

```shell
pnpm characters:build   # 从角色文件夹重建 assets/characters.json
pnpm state:split        # 把一段片段切成开头段与结尾段
```



### 检查

```shell
pnpm -F @proj-aipets/stage-web-react typecheck
pnpm -F @proj-aipets/character-animation exec vitest run
pnpm lint
```

## 功能特点


### 动画导演

没人跟宠物说话时，由导演决定它做什么。它不是随机播放。

- `src/animation/ambient-director.ts` 运行一段环境相位程序。
- 一个相位持有片段列表与时长。控制器累加时长，再用 `elapsed % total` 求出当前相位。循环没有定时器驱动，
  所以掉帧不会让相位漂移。
- `src/animation/retrieval.ts` 按当前上下文挑选片段。
- `src/animation/drag-physics.ts` 处理窗口拖拽时的反应。
- `src/animation/director-bus.ts` 与 `src/desktop/pet-relay.ts` 让每个窗口的导演状态保持一致。宠物窗口与
  聊天窗口因此显示同一个姿态。
- `src/animation/playback-history.ts` 与 `animation-log.ts` 记录播放历史，用于调试与复盘。

### 对话

- 聊天基于 `packages/provider-inference`，它封装了 [xsai](https://github.com/moeru-ai/xsai) 客户端。
- 每个角色有人设。人设随角色文件夹提供，也可来自导入的角色包。
- `src/character/affect-store.ts` 持久化情绪状态，重载后心情仍在。
- 聊天工具让模型调用内置能力：记忆、MCP 工具与插件动作。
- `src/chat/sessions.ts` 在本地保存聊天会话。

### 记忆

- 记忆是一组小条目。每个条目有名字、一行描述与正文。
- 条目归属于某个角色。没有归属的条目是通用记忆，对所有角色可见。
- 模型通过 `builtIn_readMemory`、`builtIn_writeMemory`、`builtIn_forgetMemory` 读取、写入与遗忘条目。
- 条目保存在浏览器存储里，本地使用不需要数据库。

### 耳朵

- `src/audio/recorder.ts` 采集麦克风。
- `src/audio/pipeline.ts` 做语音活动检测，并把音频送入识别器。
- `src/speech/local-recognition.ts` 在浏览器内做识别。
- `src/speech/omni-transcription.ts` 把音频交给托管转写服务。
- 设置页覆盖唤醒词、声纹、转写与听觉阈值。

### 嘴巴

- 语音合成支持多个提供商。
- `src/speech/playback.ts` 播放音频并汇报进度。
- `src/audio/beat-sync.ts` 让播放与身体动画对齐。

### 桌宠外壳

`apps/stage-web-react/electron` 里的 Electron 外壳把网页应用变成桌面宠物。

- 宠物窗口透明、无边框、始终置顶。
- 鼠标穿透模式把鼠标事件转发给下层窗口，宠物因此不挡你干活。
- 副窗口把聊天与小组件作为独立的置顶窗口运行。
- `packages/electron-native-backdrop` 与 `packages/electron-screen-capture` 提供原生窗口效果与截屏。
- `electron-builder.config.cjs` 负责打 Windows 安装包。

### 设置面板

每个功能都有设置页。页面位于 `apps/stage-web-react/src/pages/settings/`：

| 分组 | 页面 |
| --- | --- |
| 模型接入 | 提供商、提供商详情、模型、意识、模块、配方 |
| 语音 | 语音、转录、听觉、唤醒词、声纹 |
| 知识 | 记忆、记忆条目、短期记忆、长期记忆、网络搜索、视觉 |
| 系统 | 系统、桌面、动画、数据、连接、迁移 |
| 扩展 | 插件、MCP、工具卡片、贴纸、卡片、画艺、节拍同步、Home Assistant |



## 项目结构

| 路径 | 内容 |
| --- | --- |
| `apps/stage-web-react` | React 网页应用与它的 Electron 外壳。这是唯一的前端。 |
| `apps/stage-web-react/electron` | Electron 主进程、预加载、窗口与插件宿主。 |
| `apps/stage-web-react/src/animation` | 导演、片段检索、交叉淡入播放器与拖拽物理。 |
| `assets/` | 角色文件夹、片段文件与生成的 `characters.json` 索引。 |
| `packages/character-animation` | 透明视频动画内核，纯逻辑，不含 UI 框架。 |
| `packages/provider-inference` | LLM 提供商客户端。 |
| `packages/plugin-sdk`、`packages/plugin-protocol` | 插件契约。 |
| `packages/input-gamepad`、`packages/input-playstation-dualsense-5` | 输入设备驱动。 |
| `packages/server-runtime`、`packages/server-sdk`、`packages/server-shared` | `services/` 与 `plugins/` 使用的服务器通道。 |
| `plugins/` | 产品插件：象棋、Bilibili Laplace、Claude Code。 |
| `services/computer-use-mcp` | 电脑操作 MCP 服务器。 |
| `server/apps/api` | 托管 Hono 资源 API 与业务域。 |
| `server/apps/auth` | 独立的 Better Auth 与 OIDC 服务。 |
| `server/docker-compose.yaml` | 完整的本地后端栈。 |
| `docs/` | 项目文档与 ADR。 |

## 支持的 LLM 提供商

本项目只保留一个短列表。其他服务可走通用的 OpenAI 兼容接口。

- [x] [OpenAI](https://platform.openai.com/docs/guides/gpt/chat-completions-api)
- [x] [Anthropic Claude](https://anthropic.com)
- [x] [DeepSeek](https://www.deepseek.com/)
- [x] [Qwen](https://help.aliyun.com/document_detail/2400395.html)

## 文档

- [docs/README.md](./docs/README.md)：文档索引
- [docs/ai/animation-video-stage-plan.md](./docs/ai/animation-video-stage-plan.md)：透明视频舞台方案
- [AGENTS.md](./AGENTS.md)：代理与贡献者的工作规则
- [DESIGN.md](./DESIGN.md)：UI 设计指南
- [CONTRIBUTING.md](./.github/CONTRIBUTING.md)：贡献指南

## 许可证

MIT，见 [LICENSE](./LICENSE)。

## 致谢

PC2005-cloud
