import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/core/index.ts',
    react: 'src/react/index.tsx',
    vue: 'src/vue/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  target: 'es2019',
  external: ['react', 'react/jsx-runtime', 'vue'],
})
