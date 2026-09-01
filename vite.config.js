import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:4173" },
  },
  preview: { host: true, port: 4173, allowedHosts: true },
});
