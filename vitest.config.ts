import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    exclude: ["**/node_modules/**", "excalidraw-converter/**", "excalidraw-rearrange/**"],
  },
});
