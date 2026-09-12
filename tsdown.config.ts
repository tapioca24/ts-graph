import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { main: "src/cli/main.ts" },
  format: "esm",
  platform: "node",
  target: "node24",
  clean: true,
  dts: false,
  sourcemap: true,
  deps: { neverBundle: ["typescript", "citty"] },
});
