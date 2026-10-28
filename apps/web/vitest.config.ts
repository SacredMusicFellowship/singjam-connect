import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Pages and components are .tsx, and tsconfig leaves JSX for Next to compile.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
