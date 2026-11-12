/**
 * 转换流水线端到端验证脚本。
 *
 * 直接复用 src/main/audio 下的纯函数模块（Node 24 原生支持 TS 类型擦除），
 * 用 ffmpeg 实际跑一遍"追加 1 秒标记音效 + 转 320k MP3"的完整流程，并验证：
 *   1. 输出时长 = 输入时长 + 1 秒；
 *   2. 输出确为 MP3，码率接近 320 kbps；
 *   3. 尾部 1 秒存在 13kHz 以上的高频能量（机器可检测）；
 *   4. 正片音频电平几乎不变（人耳不可察觉）。
 *
 * 运行：pnpm verify
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const workDir = join(root, '.verify')
const ffmpeg = join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
const ffprobe = join(
  root,
  'node_modules',
  'ffprobe-static',
  'bin',
  'win32',
  'x64',
  'ffprobe.exe'
)

const { renderWatermarkWav, createWatermarkSpec } = await import(
  new URL('../src/main/audio/watermark.ts', import.meta.url).href
)
const { buildFfmpegArgs } = await import(
  new URL('../src/main/audio/convert-args.ts', import.meta.url).href
)

let failures = 0

function log(message) {
  console.log(message)
}

function check(label, condition, detail = '') {
  if (condition) {
    log(`  [PASS] ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failures += 1
    log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function run(bin, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else rejectPromise(new Error(`命令失败 (code ${code}): ${stderr.slice(-800)}`))
    })
  })
}

async function probe(file) {
  const { stdout } = await run(ffprobe, [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    file
  ])
  const data = JSON.parse(stdout)
  const audio = (data.streams ?? []).find((s) => s.codec_type === 'audio') ?? {}
  return {
    duration: Number.parseFloat(data.format?.duration ?? '0'),
    bitrate: Number.parseInt(data.format?.bit_rate ?? '0', 10),
    codec: audio.codec_name ?? '',
    sampleRate: Number.parseInt(audio.sample_rate ?? '0', 10),
    channels: audio.channels ?? 0
  }
}

/** 用 highpass + volumedetect 测量 13kHz 以上的能量 */
async function highBandLevel(file, seekSec, durationSec) {
  const args = []
  if (Number.isFinite(seekSec)) args.push('-ss', String(seekSec))
  args.push('-t', String(durationSec), '-i', file)
  args.push('-af', 'highpass=f=13000,volumedetect', '-f', 'null', '-')
  const { stderr } = await run(ffmpeg, args)
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  return {
    max: max ? Number.parseFloat(max[1]) : Number.NEGATIVE_INFINITY,
    mean: mean ? Number.parseFloat(mean[1]) : Number.NEGATIVE_INFINITY
  }
}

/** 把指定区间的音频解码成单声道 16bit PCM 原始样本 */
function decodePcm(file, seekSec, durationSec) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = ['-v', 'error']
    if (Number.isFinite(seekSec)) args.push('-ss', String(seekSec))
    args.push('-t', String(durationSec), '-i', file, '-ac', '1', '-ar', '44100', '-f', 's16le', '-')
    const child = spawn(ffmpeg, args, { windowsHide: true })
    const chunks = []
    let stderr = ''
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`解码失败 (code ${code}): ${stderr.slice(-400)}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      const samples = new Float32Array(Math.floor(buffer.length / 2))
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = buffer.readInt16LE(i * 2) / 32768
      }
      resolvePromise(samples)
    })
  })
}

/** Goertzel 算法：计算单频点功率（返回幅度 dBFS） */
function goertzelDb(samples, sampleRate, freq) {
  const k = 2 * Math.cos((2 * Math.PI * freq) / sampleRate)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < samples.length; i += 1) {
    const s0 = samples[i] + k * s1 - s2
    s2 = s1
    s1 = s0
  }
  const power = (s1 * s1 + s2 * s2 - k * s1 * s2) / (samples.length * samples.length)
  const amplitude = 2 * Math.sqrt(Math.max(power, 0))
  return 20 * Math.log10(amplitude + 1e-12)
}

/** 在 center 附近 ±span Hz 扫描，取最强频点（补偿 12Hz 调制造成的能量分散） */
function peakDb(samples, sampleRate, center, span = 40, step = 4) {
  let best = Number.NEGATIVE_INFINITY
  let bestFreq = center
  for (let f = center - span; f <= center + span; f += step) {
    const db = goertzelDb(samples, sampleRate, f)
    if (db > best) {
      best = db
      bestFreq = f
    }
  }
  return { db: best, freq: bestFreq }
}

async function measureVolume(file, extraArgs = []) {
  const args = ['-hide_banner', '-nostats', ...extraArgs, '-i', file, '-af', 'volumedetect', '-f', 'null', '-']
  const { stderr } = await run(ffmpeg, args)
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  return {
    max: max ? Number.parseFloat(max[1]) : Number.NEGATIVE_INFINITY,
    mean: mean ? Number.parseFloat(mean[1]) : Number.NEGATIVE_INFINITY
  }
}

async function main() {
  log('=== 音乐批量处理器 · 转换流水线验证 ===\n')

  if (!existsSync(ffmpeg)) throw new Error(`未找到 ffmpeg: ${ffmpeg}`)
  if (!existsSync(ffprobe)) throw new Error(`未找到 ffprobe: ${ffprobe}`)

  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })

  const input = join(workDir, 'sample-original.mp3')
  const output = join(workDir, 'sample-processed.mp3')
  const watermarkFile = join(workDir, 'watermark.wav')

  // 1. 生成 8 秒测试音频（440Hz + 880Hz 混合，模拟"正常音乐"）
  log('[1/5] 生成 8 秒测试音频…')
  await run(ffmpeg, [
    '-hide_banner',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=8',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=8',
    '-filter_complex',
    '[0:a][1:a]amix=inputs=2:duration=longest:weights=0.7 0.3,volume=0.5[a]',
    '-map',
    '[a]',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '320k',
    input
  ])
  const inputProbe = await probe(input)
  check('测试音频已生成', inputProbe.duration > 7.5, `${inputProbe.duration.toFixed(2)} 秒`)

  // 2. 渲染 1 秒标记音效 WAV
  log('[2/5] 渲染 1 秒标记音效…')
  const spec = createWatermarkSpec('subtle', -44, 44100)
  const wavBytes = renderWatermarkWav(spec)
  writeFileSync(watermarkFile, wavBytes)
  const wavProbe = await probe(watermarkFile)
  check(
    '标记音效时长 1 秒',
    Math.abs(wavProbe.duration - 1) < 0.02,
    `${wavProbe.duration.toFixed(3)} 秒`
  )
  check('标记音效为双声道 44.1kHz', wavProbe.channels === 2 && wavProbe.sampleRate === 44100)

  // 3. 执行与主进程完全一致的 ffmpeg 调用
  log('[3/5] 执行转换（追加标记音效 → 320k MP3）…')
  const args = buildFfmpegArgs({
    input,
    output,
    watermarkPath: watermarkFile,
    bitrate: '320k',
    sampleRate: 44100,
    hasCover: false,
    copyTags: true,
    overwrite: true
  })
  await run(ffmpeg, args)

  const outProbe = await probe(output)
  check(
    '输出时长 = 原时长 + 1 秒',
    Math.abs(outProbe.duration - (inputProbe.duration + 1)) < 0.12,
    `原 ${inputProbe.duration.toFixed(2)}s → 新 ${outProbe.duration.toFixed(2)}s`
  )
  check('输出编码为 MP3', outProbe.codec === 'mp3', outProbe.codec)
  check(
    '输出码率接近 320 kbps',
    outProbe.bitrate > 300000,
    `${Math.round(outProbe.bitrate / 1000)} kbps`
  )
  check('输出采样率 44.1kHz 双声道', outProbe.sampleRate === 44100 && outProbe.channels === 2)

  // 4. 尾部高频能量检测（机器可识别）
  log('[4/5] 检测尾部 1 秒的高频标记…')
  const tailBand = await highBandLevel(output, inputProbe.duration, 1)
  check(
    '尾部 1 秒存在 13kHz+ 能量',
    tailBand.max > -60,
    `尾部 max ${tailBand.max.toFixed(1)} dB / mean ${tailBand.mean.toFixed(1)} dB`
  )

  // 4.1 逐音符做 Goertzel 频点检测：每个音符在自己所在的时间片内是否显著高于邻近噪声底
  const tailSamples = await decodePcm(output, inputProbe.duration, 1)
  const sr = 44100
  let minSnr = Number.POSITIVE_INFINITY
  let detected = 0
  for (const note of spec.notes) {
    const from = Math.round(note.start * sr)
    const to = Math.min(tailSamples.length, Math.round((note.start + note.dur) * sr))
    const slice = tailSamples.subarray(from, to)
    if (slice.length < 1024) continue
    const peak = peakDb(slice, sr, note.freq)
    const noise = Math.max(
      peakDb(slice, sr, note.freq - 1600).db,
      peakDb(slice, sr, note.freq + 1600).db
    )
    const snr = peak.db - noise
    minSnr = Math.min(minSnr, snr)
    if (snr > 15) detected += 1
    log(
      `       ${note.freq} Hz @${note.start.toFixed(2)}s：峰 ${peak.db.toFixed(1)} dB / 邻域噪声 ${noise.toFixed(1)} dB → 信噪比 ${snr.toFixed(1)} dB`
    )
  }
  check(
    `全部 ${spec.notes.length} 个音符可被机器检出（单频信噪比 >15 dB）`,
    detected === spec.notes.length,
    `最弱 ${minSnr.toFixed(1)} dB`
  )

  const headBand = await highBandLevel(output, 0, inputProbe.duration)
  const originalBand = await highBandLevel(input, 0, inputProbe.duration)
  log(`       正片高频 mean ${headBand.mean.toFixed(1)} dB / max ${headBand.max.toFixed(1)} dB`)
  log(`       源文件高频 mean ${originalBand.mean.toFixed(1)} dB / max ${originalBand.max.toFixed(1)} dB`)

  // 5. 正片电平几乎不变（人耳不可察觉）
  log('[5/5] 对比正片电平…')
  const originalFull = await measureVolume(input)
  const outMain = await measureVolume(output, ['-t', String(inputProbe.duration)])
  check(
    '正片平均电平变化 < 0.2 dB',
    Math.abs(originalFull.mean - outMain.mean) < 0.2,
    `原 ${originalFull.mean.toFixed(2)} dB → 新 ${outMain.mean.toFixed(2)} dB`
  )
  check(
    '正片峰值电平变化 < 0.2 dB',
    Math.abs(originalFull.max - outMain.max) < 0.2,
    `原 ${originalFull.max.toFixed(2)} dB → 新 ${outMain.max.toFixed(2)} dB`
  )

  log('')
  if (failures === 0) {
    log(`全部检查通过 ✔  输出文件：${output}`)
  } else {
    log(`存在 ${failures} 项失败 ✘`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
