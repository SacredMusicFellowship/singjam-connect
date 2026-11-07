import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // RLS tests need a running local Supabase; they run with npm run test:rls.
    exclude: ["**/node_modules/**", "src/rls/**"],
  },
});
