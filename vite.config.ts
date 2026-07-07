import { defineConfig } from "vite"

// Minimal, dependency-light static build. Output is deployed immutably to
// sandbox.avibe.bot and its hash is pinned by the Avibe local install.
export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Content-hashed, immutable asset filenames.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
})
