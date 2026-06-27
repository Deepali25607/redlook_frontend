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
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor libraries into their own long-cached
        // chunks so an app-code deploy doesn't invalidate React/i18n/icons in
        // the browser cache. Returning undefined leaves app code in the
        // default chunking (which now also splits the lazy admin portal).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]react(-dom)?[\\/]|[\\/]scheduler[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
})
