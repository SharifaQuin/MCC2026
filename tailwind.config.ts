import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f6f5",
          100: "#e1e9e6",
          500: "#2f6b57",
          600: "#265646",
          700: "#1e4437",
        },
      },
    },
  },
  plugins: [],
};
export default config;
