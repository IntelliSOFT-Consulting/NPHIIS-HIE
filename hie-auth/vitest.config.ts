import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The dev box also runs the whole HIE stack; one worker per core starves it.
    maxWorkers: 2,
  },
});
