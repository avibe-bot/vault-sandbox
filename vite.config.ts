import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

// Minimal, dependency-light static build. Output is deployed immutably to
// sandbox.avibe.bot and its hash is pinned by the Avibe local install.
export default defineConfig({
  resolve: {
    alias: {
      crypto: fileURLToPath(new URL("./src/nodeCryptoShim.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INVALID_ANNOTATION" && warning.message.includes("contains an annotation")) return
        warn(warning)
      },
      output: {
        // Content-hashed, immutable asset filenames.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
})
