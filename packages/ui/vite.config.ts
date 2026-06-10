import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/token": "http://localhost:8788",
      "/mode": "http://localhost:8788",
      "/persona": "http://localhost:8788"
    }
  }
});
