import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  modules: ["workflow/nitro"],
  handlers: [{ route: "/**", handler: "./src/agent/main.ts" }],
  ignore: ["**/*.test.ts", "**/*.test.tsx"],
  externals: {
    external: ["bun:test", "bun:sqlite"],
  },
});
