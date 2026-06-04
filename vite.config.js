import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // iOS Safari can silently fail loading module scripts with crossorigin
    // on same-origin resources — remove it from the generated HTML.
    {
      name: 'remove-crossorigin',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html.replace(/ crossorigin/g, '');
        }
      }
    }
  ],
  base: '/stratachroma/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
