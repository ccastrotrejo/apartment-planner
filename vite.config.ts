import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works from https://ccastrotrejo.github.io/apartment-planner/.
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 8765,
    strictPort: true,
  },
  build: {
    // three (~720 kB) and the R3F/postprocessing stack (~570 kB) are isolated vendor chunks that
    // cache independently of app code; only warn if one of them grows past this.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing', 'n8ao'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
