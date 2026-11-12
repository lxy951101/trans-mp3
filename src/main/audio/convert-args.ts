/**
 * ffmpeg / ffprobe 命令行参数构建（纯函数，便于单独验证）。
 *
 * 转换流程：
 *   原始音频 --(重采样到目标采样率 / 双声道)--> [主音轨]
 *   1 秒标记音效 WAV            ------------> [音效轨]
 *   [主音轨] + [音效轨] --concat--> 高品质 MP3
 */

import type { BitratePreset } from '@shared/types'

export interface FfmpegBuildParams {
  input: string
  output: string
  /** 标记音效 WAV 绝对路径；为 null 表示不追加 */
  watermarkPath: string | null
  bitrate: BitratePreset
  sampleRate: number
  /** 输入是否带内嵌封面（mp3/flac 的 attached_pic） */
  hasCover: boolean
  copyTags: boolean
  overwrite: boolean
}

/** 构建 ffprobe 参数：以 JSON 输出格式与流信息 */
export function buildProbeArgs(input: string): string[] {
  return ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input]
}

/** 构建 ffmpeg 参数 */
export function buildFfmpegArgs(params: FfmpegBuildParams): string[] {
  const { input, output, watermarkPath, sampleRate, hasCover, copyTags, overwrite } = params

  const args: string[] = [
    '-hide_banner',
    '-nostdin',
    '-nostats',
    '-loglevel',
    'error',
    '-progress',
    'pipe:1'
  ]

  args.push(overwrite ? '-y' : '-n')
  args.push('-i', input)

  if (watermarkPath) {
    args.push('-i', watermarkPath)
    const filter = [
      `[0:a:0]aresample=${sampleRate}:async=1,aformat=sample_fmts=fltp:channel_layouts=stereo[main]`,
      `[1:a:0]aresample=${sampleRate}:async=1,aformat=sample_fmts=fltp:channel_layouts=stereo[wm]`,
      '[main][wm]concat=n=2:v=0:a=1[out]'
    ].join(';')
    args.push('-filter_complex', filter)
    args.push('-map', '[out]')
  } else {
    args.push('-map', '0:a:0')
  }

  if (hasCover) {
    // 复制内嵌封面（MP3 的 attached_pic 流）
    args.push('-map', '0:v:0?', '-c:v', 'copy')
  }

  if (copyTags) {
    args.push('-map_metadata', '0', '-id3v2_version', '3')
  } else {
    args.push('-map_metadata', '-1')
  }

  args.push('-ac', '2', '-ar', String(sampleRate), '-c:a', 'libmp3lame')

  if (params.bitrate === 'v0') {
    args.push('-q:a', '0')
  } else {
    args.push('-b:a', params.bitrate)
  }

  args.push(output)
  return args
}

/** 码率预设的中文说明，供 UI 展示 */
export const BITRATE_LABELS: Record<BitratePreset, string> = {
  '320k': '320 kbps（最高品质）',
  '256k': '256 kbps（高品质）',
  v0: 'VBR V0（约 245 kbps，体积更小）',
  '192k': '192 kbps（标准）'
}
