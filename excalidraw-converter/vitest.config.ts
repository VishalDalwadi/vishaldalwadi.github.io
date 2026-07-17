import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["production"],
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    server: {
      deps: {
        inline: [/@excalidraw\/excalidraw/, /roughjs/],
      },
    },
  },
});
