import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import { exec } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

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
        const raw = addr.address
        const host =
          raw === '::' || raw === '0.0.0.0' ? '127.0.0.1' : raw === '::1' ? '127.0.0.1' : raw
        const url = `http://${host}:${addr.port}/`
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
    /** true: 127.0.0.1 / localhost / LAN 모두에서 접속 (일부 환경에서 단일 바인딩 시 빈 화면·접속 실패 완화) */
    host: true,
    port: 5199,
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
