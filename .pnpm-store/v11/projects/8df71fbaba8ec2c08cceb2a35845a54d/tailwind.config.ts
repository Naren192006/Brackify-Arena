/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./styles/**/*.css"],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "var(--arena-bg)",
          "bg-elevated": "var(--arena-bg-elevated)",
          surface: "var(--arena-surface)",
          "bg-card": "var(--arena-surface)",
          text: "var(--arena-text)",
          muted: "var(--arena-text-muted)",
          accent: "var(--arena-accent)",
          gold: "var(--arena-warning)",
          danger: "var(--arena-danger)",
          success: "var(--arena-success)",
        },
      },
      fontFamily: {
        display: ["var(--font-rajdhani)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-live": "pulse-live 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};
