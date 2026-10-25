
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/proxy-payment": {
        target: "http://localhost:5001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-payment/, ""),
      },
      "/proxy-recovery": {
        target: "http://localhost:5002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-recovery/, ""),
      },
    },
  },
});
