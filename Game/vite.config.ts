import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Keep the simulation/UI entry independent from Three's large renderer
        // and reusable math/data core. This improves cache granularity without
        // hiding legitimate renderer-weight warnings behind a raised limit.
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core')) return 'three-core';
          if (id.includes('/node_modules/three/')) return 'three-renderer';
        },
      },
    },
  },
});
