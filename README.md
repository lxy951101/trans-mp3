# 音乐批量处理器

批量导入音频文件，一键转成高质量 MP3。支持修改比特率、采样率，增加尾音功能。

技术栈：**Vue 3 + TypeScript + Electron + Vite + SCSS + pnpm**，转码与探测由内置的 ffmpeg / ffprobe 二进制完成（无需用户另装）。

---

## 功能

| 分区 | 说明 |
| --- | --- |
| 批量导入 | 16 种音频格式（mp3 / flac / wav / m4a / aac / ogg / opus / wma / aiff / ape / wv / amr / mp2 / m4b / caf …）；支持「选择文件」「导入文件夹」（递归 8 层）与拖拽；重复文件自动跳过 |
| 输出格式 | MP3，码率 320k / 256k / V0 / 192k，采样率 44.1k / 48k，双声道；可选保留标题、艺术家、专辑与内嵌封面 |
| 输出位置 | 与源文件同目录，或指定目录；可自定义文件名后缀（默认 `_processed`）；同名文件默认不覆盖，自动加 ` (2)`、` (3)` |
| 尾部标记音效 | 三个隐蔽等级（隐形式 / 标准 / 增强），音效电平可在 -60 ~ -24 dBFS 微调；输出时长 = 原时长 + 1.000 秒 |
| 处理控制 | 并发 1~4、实时进度与速度、可中途取消；完成后可一键打开或定位输出文件 |
| 记忆 | 所有设置持久化到 `%APPDATA%/music-tool/settings.json` |

界面为深色无边框窗口（自绘标题栏），全程中文。

---

## 快速开始

```bash
pnpm install       # 安装依赖（会下载 Electron 与 ffmpeg 二进制）
pnpm dev           # 开发模式，热更新
```

构建与打包：

```bash
pnpm build         # 产物输出到 out/
pnpm build:win     # 生成 Windows 安装包到 release/
```

其他脚本：

```bash
pnpm typecheck     # 主进程 + 渲染层类型检查
pnpm verify        # 端到端验证转码管线（见下）
pnpm preview:ui    # 不启动 Electron，直接在浏览器预览界面（http://127.0.0.1:5178）
```

> `pnpm preview:ui` 用于调试界面：在没有 Electron 环境时会自动注入一套模拟 API（`src/renderer/src/mock`），访问 `http://127.0.0.1:5178/?demo=list` 还能预置 3 条示例曲目。

---

## 尾部标记音效是怎么实现的

`src/main/audio/watermark.ts` 是纯函数模块，不依赖 Node，因此既能被主进程调用，也能被验证脚本直接 import。

- **位置**：追加在音频末尾的 1.000 秒里 —— 用 `concat` 滤镜把「原音轨」与「标记音轨」首尾相接，所以原曲的波形、动态、响度完全不改动。
- **内容**：4 个 14.5 ~ 16.9 kHz 的短促高频音，每段约 100 ms，带 6 ms 淡入、12 ms 淡出与 12 Hz 幅度调制，峰值电平默认 **-44 dBFS**。
- **为什么听不出来**：1）频率位于多数成人听阈边缘；2）电平比正片低 40 dB 以上；3）单段只有 0.1 秒，且被调制打散，不形成持续音调。
- **为什么机器能识别**：高频带能量在正片几乎为零，而尾部是稳定的四个窄带峰值，做一次 Goertzel / FFT 就能判定；验证脚本实测信噪比 **> 50 dB**。

三个等级的差别（频率、时长占比、电平上限）：

| 等级 | 频点 | 每段占比 | 最大电平 |
| --- | --- | --- | --- |
| 隐形式 | 14.5 / 15.7 / 16.9 kHz | 10% | -38 dBFS |
| 标准 | 14.3 / 15.6 / 17.0 kHz | 12% | -36 dBFS |
| 增强 | 12.0 / 13.6 / 15.2 kHz | 14% | -34 dBFS |

可调参数集中在 `WATERMARK_PRESETS` 与 `DEFAULT_OPTIONS.watermarkVolume`，想改频点或节奏只改这两处即可。

音频处理链（`src/main/audio/convert-args.ts`）：

```
[0:a:0] aresample=44100:async=1, aformat=fltp/stereo  ┐
[1:a:0] aresample=44100:async=1, aformat=fltp/stereo  ┴ concat=n=2:v=0:a=1
                                        → libmp3lame (CBR/VBR) → 输出 .mp3
```

---

## 验证

`pnpm verify` 会完整跑一遍真实管线（不是单元测试里的假数据）：

1. 用 ffmpeg 合成一段 440 Hz + 880 Hz 的 8 秒测试源；
2. 渲染标记 WAV，调用与主进程**完全相同**的 `buildFfmpegArgs()` 转码；
3. ffprobe 校验时长（+1 秒）、码率（>300k）、采样率、声道；
4. 解码尾部 1 秒，对每个音符做 Goertzel 检测，与邻域噪声底比较信噪比；
5. 解码正片，确认电平未变化（< 0.2 dB 偏移）。

最近一次运行结果：

```
✓ 原时长 8.05s → 新时长 9.04s（+1 秒）
✓ 输出 321 kbps / 44.1 kHz / 双声道 / mp3
✓ 标记音效时长 1.000s，4 个音符信噪比 51.9 ~ 52.6 dB
✓ 正片电平 -32.50 → -32.50 dB（0.00 dB 偏移）
✓ 全部通过
```

---

## 目录结构

```
src/
├─ main/                    Electron 主进程
│  ├─ index.ts              窗口与生命周期
│  ├─ ipc.ts                全部 IPC 通道（扫描 / 设置 / 转码 / 系统对话框）
│  ├─ scan.ts               目录递归扫描 + 并发 ffprobe 探测
│  ├─ settings.ts           设置读写与校验
│  └─ audio/
│     ├─ ffmpeg.ts          定位 ffmpeg / ffprobe 二进制
│     ├─ convert-args.ts    纯函数：拼装 ffmpeg 命令行
│     ├─ watermark.ts       纯函数：标记音效规格与 WAV 渲染
│     └─ processor.ts       并发队列、进度解析、取消、重试
├─ preload/                 contextBridge 暴露的 API
├─ shared/                  主进程与渲染层共享的类型与常量
└─ renderer/                Vue 3 界面
   └─ src/
      ├─ App.vue            状态中枢与事件订阅
      ├─ components/        标题栏 / 设置面板 / 拖拽区 / 曲目列表 / 提示
      ├─ composables/       useToast
      ├─ mock/              浏览器预览用的模拟 API
      └─ utils/format.ts    时长、大小、码率格式化
scripts/
├─ verify-pipeline.mjs      端到端验证
├─ preview.config.mjs       浏览器预览配置
└─ icon.html                应用图标源文件（导出 build/icon.png）
```

---

## 说明

- 输出文件名默认为 `原名_processed.mp3`；若与已有文件重名，会依次尝试加序号，绝不覆盖源文件。
- 转码失败时会自动用「不复制封面」的方式重试一次（部分 MP3 封面会导致 `-map 0:v:0` 报错）。
- 取消操作会终止所有正在运行的 ffmpeg 子进程，并把排队中的曲目标记为「已取消」。
- 处理期间设置面板会整体锁定，避免中途改变码率等参数造成前后不一致。

---


