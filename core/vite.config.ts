import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@kit': path.resolve(import.meta.dirname, '../engine/kit'),
      '@engine': path.resolve(import.meta.dirname, '../engine/src'),
    },
  },
  // The design kit and the engine live beside the app in the monorepo.
  server: { fs: { allow: ['..'] } },
})
