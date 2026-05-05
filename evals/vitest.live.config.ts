import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env vars to pass to test workers via Vitest env option
const envVars: Record<string, string> = {};
try {
  const envPath = resolve(import.meta.dirname, "..", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    envVars[key] = value;
  }
} catch {
  // .env not found — env vars must be set externally (CI)
}

/**
 * Live eval config — requires AZURE_INFERENCE_URL + `az login`.
 * Run with: npm run eval:live
 */
export default defineConfig({
  test: {
    include: [
      "evals/live/**/*.eval.ts",
    ],
    testTimeout: 120_000,
    reporters: ["verbose", "./evals/reporters/json-persist.ts"],
    env: envVars,
  },
});
