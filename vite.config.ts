import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Démo statique Vercel : pas de Worker Cloudflare, export SPA prérendu
// (src/server.ts, le handler CF, n'est plus utilisé comme entry — voir server.ts.bak)
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    spa: { enabled: true },
  },
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
        },
        '/tiles': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  },
});
