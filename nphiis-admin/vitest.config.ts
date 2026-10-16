import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // The dev box also runs the whole HIE stack; one worker per core starves it.
    maxWorkers: 2,
  },
});
