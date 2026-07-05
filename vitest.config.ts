import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests run in a plain Node environment. The `@/*` alias mirrors the
// tsconfig `paths` mapping so imports resolve the same way they do under Next.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Env used by tests that read process.env (auth). These are dummy values,
    // never real secrets — they only need to be present and long enough.
    env: {
      AUTH_SECRET: "test-auth-secret-at-least-16-chars-long",
      DASHBOARD_PASSWORD: "test-password",
      WHATSAPP_APP_SECRET: "test-app-secret",
      WHATSAPP_VERIFY_TOKEN: "test-verify-token",
    },
  },
});
