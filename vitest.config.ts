import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "evals/**/*.eval.ts",
      // Exclude live evals by default — they require OPENAI_API_KEY
      "!evals/live/**",
    ],
    testTimeout: 30_000,
    reporters: ["verbose", "./evals/reporters/json-persist.ts"],
  },
});
