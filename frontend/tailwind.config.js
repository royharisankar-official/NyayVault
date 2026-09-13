/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: { ink: "#07111f", panel: "#0d1b2e", mint: "#56e0bd", electric: "#72a7ff" },
      boxShadow: { glow: "0 0 50px rgba(86,224,189,.12)" }
    }
  },
  plugins: []
};
