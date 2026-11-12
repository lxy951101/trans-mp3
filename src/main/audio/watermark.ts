/**
 * 尾部标记音效生成器。
 *
 * 设计目标：
 * - 时长 1 秒，追加在原音频之后，让输出与原文件产生可检测的差异；
 * - 能量集中在 14kHz~17kHz 的高频区，成年人听力上限普遍在 15~17kHz，
 *   在正常听音音量下几乎不可察觉（"99% 的人听不出来"）；
 * - 每个音符都带 12Hz 幅度调制与淡入淡出，频谱上有独立的边带指纹，
 *   机器侧（频谱分析 / 指纹比对）可以稳定识别。
 *
 * 本模块是纯函数，不依赖 Node.js / Electron，方便被构建脚本与验证脚本复用。
 */

export interface WatermarkNote {
  /** 频率（Hz） */
  freq: number
  /** 起始时间（秒） */
  start: number
  /** 持续时间（秒） */
  dur: number
  /** 相对增益 0~1 */
  gain: number
}

export interface WatermarkSpec {
  durationSec: number
  sampleRate: number
  /** 整体电平（dBFS），例如 -44 */
  levelDb: number
  notes: WatermarkNote[]
}

export const WATERMARK_DURATION = 1

/**
 * 三档预设：
 * subtle   —— 默认，最隐蔽，高频短音
 * standard —— 稍明显一些，检测更稳
 * enhanced —— 增强档，仍刻意保持低于感知阈值
 */
export const WATERMARK_PRESETS: Record<'subtle' | 'standard' | 'enhanced', WatermarkNote[]> = {
  subtle: [
    { freq: 14500, start: 0.04, dur: 0.1, gain: 0.7 },
    { freq: 15700, start: 0.24, dur: 0.1, gain: 0.7 },
    { freq: 16900, start: 0.44, dur: 0.1, gain: 0.7 },
    { freq: 14500, start: 0.64, dur: 0.1, gain: 0.7 }
  ],
  standard: [
    { freq: 14300, start: 0.05, dur: 0.12, gain: 1 },
    { freq: 15600, start: 0.26, dur: 0.12, gain: 0.9 },
    { freq: 17000, start: 0.47, dur: 0.12, gain: 0.8 },
    { freq: 15600, start: 0.68, dur: 0.12, gain: 0.9 }
  ],
  enhanced: [
    { freq: 12000, start: 0.04, dur: 0.14, gain: 1 },
    { freq: 13600, start: 0.26, dur: 0.14, gain: 0.95 },
    { freq: 15200, start: 0.48, dur: 0.14, gain: 0.9 },
    { freq: 12000, start: 0.7, dur: 0.14, gain: 1 }
  ]
}

/** 幅度调制频率，用于产生可识别的边带指纹 */
const MODULATION_HZ = 12

/** 淡入 / 淡出时间，避免爆音 */
const ATTACK_SEC = 0.006
const RELEASE_SEC = 0.012

export function createWatermarkSpec(
  preset: 'subtle' | 'standard' | 'enhanced',
  levelDb = -44,
  sampleRate = 44100
): WatermarkSpec {
  const notes = WATERMARK_PRESETS[preset] ?? WATERMARK_PRESETS.subtle
  return {
    durationSec: WATERMARK_DURATION,
    sampleRate,
    levelDb: clamp(levelDb, -70, -18),
    notes: notes.map((n) => ({ ...n }))
  }
}

/**
 * 将描述渲染为标准 16bit PCM WAV 的字节内容。
 * 输出为双声道，保证与任意输入音频 concat 时声道布局一致。
 */
export function renderWatermarkWav(spec: WatermarkSpec): Uint8Array {
  const channels = 2
  const sampleRate = spec.sampleRate
  const frames = Math.max(1, Math.round(spec.durationSec * sampleRate))
  const bytesPerSample = 2
  const dataSize = frames * channels * bytesPerSample
  const buffer = new Uint8Array(44 + dataSize)
  const view = new DataView(buffer.buffer)

  writeAscii(buffer, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(buffer, 8, 'WAVE')
  writeAscii(buffer, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(buffer, 36, 'data')
  view.setUint32(40, dataSize, true)

  const masterGain = Math.pow(10, spec.levelDb / 20)

  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate
    let sample = 0
    for (const note of spec.notes) {
      const local = t - note.start
      if (local < 0 || local > note.dur) continue

      let env = 1
      // 淡入
      if (local < ATTACK_SEC) env *= local / ATTACK_SEC
      // 淡出
      const tail = note.dur - local
      if (tail < RELEASE_SEC) env *= tail / RELEASE_SEC
      // 12Hz 幅度调制，产生边带
      env *= 0.8 + 0.2 * Math.sin(2 * Math.PI * MODULATION_HZ * local)

      sample += Math.sin(2 * Math.PI * note.freq * local) * env * note.gain
    }

    const pcm = clamp(sample * masterGain, -1, 1)
    const int16 = Math.round(pcm * 32767)
    const offset = 44 + i * channels * bytesPerSample
    view.setInt16(offset, int16, true)
    view.setInt16(offset + bytesPerSample, int16, true)
  }

  return buffer
}

/** 生成缓存键，用于复用已渲染的临时 WAV 文件 */
export function watermarkCacheKey(spec: WatermarkSpec): string {
  const notes = spec.notes.map((n) => `${n.freq}:${n.start}:${n.dur}:${n.gain}`).join('|')
  return `${spec.levelDb}_${spec.sampleRate}_${spec.durationSec}_${notes}`
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
