import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// The demo imports the library straight from src/ so it always shows the current code.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      'scrollframes/react': resolve(__dirname, '../src/react/index.tsx'),
      'scrollframes/vue': resolve(__dirname, '../src/vue/index.ts'),
      scrollframes: resolve(__dirname, '../src/core/index.ts'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        react: resolve(__dirname, 'react.html'),
        vue: resolve(__dirname, 'vue.html'),
      },
    },
  },
})
