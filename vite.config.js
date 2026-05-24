import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev server pinned to 5174 so it never collides with the FreshKart
// frontend on :5173. CORS_ORIGINS in redlook_backend/.env must list this
// origin (and it does).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
  },
})
