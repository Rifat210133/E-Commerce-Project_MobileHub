/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Premium Tech Core – Deep Blue + neutrals
        primary: {
          DEFAULT: "#00236F",
          50: "#EEF2FA",
          100: "#D5DEEE",
          200: "#AABEDD",
          300: "#7F9DCC",
          400: "#557EBB",
          500: "#00236F",
          600: "#001D5C",
          700: "#001748",
          800: "#001133",
          900: "#000B1F",
        },
        ink: {
          DEFAULT: "#0F172A",
          muted: "#475569",
          subtle: "#94A3B8",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          alt: "#F8FAFC",
          border: "#E2E8F0",
          container: "#F1F5F9",
        },
        accent: {
          gold: "#C8A24B",
          danger: "#DC2626",
          warning: "#F59E0B",
          success: "#16A34A",
          info: "#0EA5E9",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        "display-lg": ["56px", { lineHeight: "64px", fontWeight: 700, letterSpacing: "-0.02em" }],
        "display-md": ["44px", { lineHeight: "52px", fontWeight: 700, letterSpacing: "-0.02em" }],
        "headline-lg": ["32px", { lineHeight: "40px", fontWeight: 600 }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: 600 }],
        "title-lg": ["20px", { lineHeight: "28px", fontWeight: 600 }],
        "title-md": ["16px", { lineHeight: "24px", fontWeight: 600 }],
        "body-lg": ["18px", { lineHeight: "28px" }],
        "body-md": ["16px", { lineHeight: "24px" }],
        "body-sm": ["14px", { lineHeight: "20px" }],
        "label-md": ["14px", { lineHeight: "20px", fontWeight: 500 }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: 500 }],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        elevated:
          "0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)",
        sticky: "0 2px 8px rgba(15, 23, 42, 0.06)",
      },
      spacing: {
        sidebar: "280px",
      },
    },
  },
  plugins: [],
};
