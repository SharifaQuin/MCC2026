import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Navy — from the Mama's Cleaning Crew logo/email signature
        brand: {
          50: "#EEF1F6",
          100: "#D7DEE9",
          200: "#AFC0D6",
          300: "#8199BC",
          400: "#4F6B96",
          500: "#2C4470",
          600: "#1B2A4A",
          700: "#14213A",
          800: "#0E182A",
          900: "#090F1C",
        },
        // Gold — the accent color from the same brand materials
        gold: {
          50: "#FBF6E9",
          100: "#F3E6C0",
          200: "#E9D28E",
          300: "#DBBB5E",
          400: "#CDA83F",
          500: "#C9A227",
          600: "#B8901E",
          700: "#96741A",
        },
      },
    },
  },
  plugins: [],
};
export default config;
