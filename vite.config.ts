import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app is 100% static: `base: './'` keeps every asset path relative so the
// same build works on GitHub Pages, Netlify, Vercel or a plain file server.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
})
