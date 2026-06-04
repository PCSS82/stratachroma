import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    // iOS Safari can silently fail loading module scripts with crossorigin
    {
      name: 'remove-crossorigin',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html.replace(/ crossorigin/g, '');
        }
      }
    },
    // Since rollupOptions.input is a JS file (not index.html), Vite won't
    // transform/emit index.html automatically — copy it manually to dist/.
    {
      name: 'copy-index-html',
      closeBundle() {
        if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
        copyFileSync('index.html', 'dist/index.html');
        if (existsSync('public/.nojekyll')) copyFileSync('public/.nojekyll', 'dist/.nojekyll');
      }
    }
  ],
  base: '/stratachroma/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Explicit JS entry so Vite doesn't try to resolve index.html's script src
      // (which now points to the built output, not a source file)
      input: resolve(__dirname, 'src/main.jsx'),
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
