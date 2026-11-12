/**
 * 独立预览配置：不依赖 Electron，直接在浏览器里打开渲染层。
 *
 *   node node_modules/vite/bin/vite.js --config scripts/preview.config.mjs
 *
 * 打开 http://127.0.0.1:5178/ 查看空状态，
 * 打开 http://127.0.0.1:5178/?demo=list 查看带演示文件的列表状态。
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

export default defineConfig({
  root: resolve(projectRoot, 'src/renderer'),
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': resolve(projectRoot, 'src/renderer/src'),
      '@shared': resolve(projectRoot, 'src/shared')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true
  }
})
