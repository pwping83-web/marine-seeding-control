import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import { exec } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/** 개발 서버 포트 — 문서·CAPTURE_URL 기본값과 맞출 것 */
const DEV_PORT = 5111
/**
 * 브라우저 자동 실행·안내 문구와 동일한 접속 주소.
 * 다른 PC에서 테스트할 때는 `VITE_OPEN_URL`로 덮어쓰거나 이 상수를 본인 LAN IP에 맞게 수정.
 */
const DEV_PUBLIC_ORIGIN =
  (process.env.VITE_OPEN_URL?.replace(/\/$/, '') || 'http://192.168.45.214:5111') + '/'

/**
 * Vite 기본 `server.open`은 Cursor 통합 터미널·일부 환경에서 동작하지 않는 경우가 있어,
 * 리스닝 직후 OS별로 브라우저를 한 번 띄웁니다. 끄려면 `VITE_OPEN=0 npm run dev`
 */
function openBrowserOnReady(): Plugin {
  return {
    name: 'open-browser-on-ready',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITE_OPEN === '0') return
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address()
        if (!addr || typeof addr === 'string') return
        const url = DEV_PUBLIC_ORIGIN
        if (process.platform === 'win32') {
          exec(`cmd /c start "" "${url}"`, (err) => {
            if (err) console.error('[vite] 브라우저 열기 실패:', err.message)
          })
        } else if (process.platform === 'darwin') {
          exec(`open "${url}"`)
        } else {
          exec(`xdg-open "${url}"`)
        }
      })
    },
  }
}

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  server: {
    /** `0.0.0.0`: 같은 머신의 LAN IP(예: 192.168.45.214)로도 접속 가능 */
    host: '0.0.0.0',
    port: DEV_PORT,
    strictPort: true,
    /** 내장 open은 Cursor 터미널에서 무시되는 경우가 많아 `openBrowserOnReady`에서 처리 */
    open: false,
  },
  plugins: [
    openBrowserOnReady(),
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
