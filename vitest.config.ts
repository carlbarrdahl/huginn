import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    server: {
      deps: {
        // Bundle these packages via Vite so JSON imports don't require `type: json` attribute
        inline: ["@curator-studio/sdk", "@curator-studio/contracts"],
      },
    },
  },
});
