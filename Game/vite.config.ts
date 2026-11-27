import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * M015 build id for the performance report: the source commit, and whether
 * source files had uncommitted changes (the built Game/dist and the bundled
 * tests are ignored, so rebuilding them does not mark a build dirty). No
 * timestamp, so the same commit always builds the same bundle.
 */
function buildId(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync("git status --porcelain --untracked-files=no -- . ':(exclude)dist' ':(exclude)tests/.build'", { encoding: 'utf8' }).trim() !== '';
    return { commit, dirty };
  } catch { return { commit: 'unknown', dirty: true }; }
}

export default defineConfig({
  define: { __ASTRIX_BUILD__: JSON.stringify(buildId()) },
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
