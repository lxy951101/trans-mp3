import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.scss'

async function bootstrap(): Promise<void> {
  // 在普通浏览器中打开渲染层时（没有 Electron 注入的 window.api），
  // 自动挂载一套演示数据，方便预览界面。
  if (import.meta.env.DEV && !('api' in window)) {
    const { installMockApi } = await import('./mock')
    installMockApi()
  }

  createApp(App).mount('#app')
}

void bootstrap()
