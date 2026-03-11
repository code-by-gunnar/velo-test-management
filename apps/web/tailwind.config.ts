import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Override default gray with cool Tailwind gray ────────────── */
        gray: {
          50:  "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
          950: "#030712",
        },

        /* ── Brand — primary blue ─────────────────────────────────────── */
        primary: {
          DEFAULT: "#2D7FF9",
          hover:   "#1A6BE8",
          selected: "#EBF3FF",
        },
        mist: "#E8EDF2",

        /* ── Status — muted & earthy (UNCHANGED) ─────────────────────── */
        pass:    { DEFAULT: "#3D9970", bg: "#EBF5F0", text: "#1B5E42" },
        fail:    { DEFAULT: "#C0392B", bg: "#FCEAE8", text: "#7B241C" },
        blocked: { DEFAULT: "#D4820C", bg: "#FDF3E2", text: "#8B5A08" },
        skipped: { DEFAULT: "#8B8680", bg: "#F2F1EE", text: "#5C574E" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body:    ["var(--font-body)", "system-ui", "sans-serif"],
        mono:    ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "page-title": ["28px", { lineHeight: "1.2", fontWeight: "600" }],
        "section-label": ["12px", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.05em" }],
        "table-header": ["12px", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.05em" }],
        "body-default": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "caption": ["12px", { lineHeight: "1.4", fontWeight: "400" }],
      },
      letterSpacing: {
        label: "0.05em",
      },
      borderRadius: {
        sm:   "6px",
        md:   "8px",
        lg:   "12px",
        full: "9999px",
      },
      boxShadow: {
        card:     "0px 1px 3px rgba(0, 0, 0, 0.1), 0px 1px 2px rgba(0, 0, 0, 0.06)",
        dropdown: "0px 4px 6px rgba(0, 0, 0, 0.1), 0px 2px 4px rgba(0, 0, 0, 0.06)",
        toast:    "0px 4px 12px rgba(0, 0, 0, 0.15)",
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
