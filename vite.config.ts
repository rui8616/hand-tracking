import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["three", "@mediapipe/tasks-vision"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
