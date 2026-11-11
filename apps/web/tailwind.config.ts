import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/core/src/**/*.ts",
  ],
  theme: {
    extend: {
      keyframes: {
        "attention-pop": {
          "0%": {
            opacity: "0",
            transform: "translateY(4px) scale(0.97)",
            boxShadow: "0 0 0 0 rgba(99, 102, 241, 0.4)",
          },
          "50%": {
            opacity: "1",
            transform: "translateY(0) scale(1)",
            boxShadow: "0 0 0 6px rgba(99, 102, 241, 0.2)",
          },
          "100%": {
            boxShadow: "0 0 0 14px rgba(99, 102, 241, 0)",
          },
        },
      },
      animation: {
        "attention-pop": "attention-pop 0.6s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
