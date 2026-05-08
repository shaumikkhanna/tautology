import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./content/**/*.{html,json}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#24211d",
        soot: "#33302c",
        paper: "#bab084",
        paperLight: "#d6cc9b",
        brass: "#ffcc00",
        rule: "#5b5139",
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"],
        mono: ["Courier New", "Courier", "monospace"],
      },
      boxShadow: {
        hard: "4px 4px 0 #24211d",
      },
    },
  },
  plugins: [],
};

export default config;
