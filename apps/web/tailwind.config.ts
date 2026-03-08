import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cobalt: {
          DEFAULT: "#2563EB",
          light: "#DBEAFE",
          dark: "#1D4ED8",
        },
        mist: "#F8FAFC",
        pass: { DEFAULT: "#4ADE80", bg: "#F0FDF4", text: "#166534" },
        fail: { DEFAULT: "#F87171", bg: "#FEF2F2", text: "#991B1B" },
        blocked: { DEFAULT: "#FBBF24", bg: "#FFFBEB", text: "#92400E" },
        skipped: { DEFAULT: "#94A3B8", bg: "#F1F5F9", text: "#475569" },
      },
      fontFamily: {
        ui: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      width: {
        sidebar: "240px",
        "sidebar-collapsed": "48px",
      },
    },
  },
  plugins: [],
}

export default config
