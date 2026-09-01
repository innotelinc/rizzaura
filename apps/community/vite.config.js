import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:8000" },
  },
  preview: { host: true, port: 3012, allowedHosts: true },
});
