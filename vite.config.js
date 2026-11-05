import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relative asset paths, so dist/ works from any folder or sub-path (e.g. GitHub Pages)
  base: "./",
  // `npm run dev` forwards API calls to the API running locally (see docker-compose.yml)
  server: { proxy: { "/api": "http://localhost:3000" } },
});
