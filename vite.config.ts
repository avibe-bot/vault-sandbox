import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"

import { closedGraphPlugin } from "./scripts/release-lib.mjs"

// Production bytes are always built by release.mjs from the complete source-input
// digest. Dev identity exists only in local Vite/tests; never in /v/ releases.
export default defineConfig(({ command }) => {
  const id = process.env.SANDBOX_BUILD_ID
  if (command === "build" && !/^[a-f0-9]{64}$/.test(id ?? "")) throw new Error("Use npm run release:stage to build immutable releases")
  return {
  define: {
    __SANDBOX_BUILD_HASH__: JSON.stringify(id ?? "dev"),
    __SANDBOX_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version),
  },
  plugins: command === "build" ? [closedGraphPlugin()] : [],
  resolve: {
    alias: {
      crypto: fileURLToPath(new URL("./src/nodeCryptoShim.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    modulePreload: false,
    // Library entry avoids Vite's dynamic preload helper. Even an inlined Node
    // crypto shim must not leave a runtime link/script loader in the graph.
    lib: { entry: fileURLToPath(new URL('./src/main.ts', import.meta.url)), formats: ['es'] },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INVALID_ANNOTATION" && warning.message.includes("contains an annotation")) return
        warn(warning)
      },
      output: {
        inlineDynamicImports: true,
        // Content-hashed, immutable asset filenames.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
  }
})
