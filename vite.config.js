import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relative asset paths, so dist/ works from any folder or sub-path (e.g. GitHub Pages)
  base: "./",
});
