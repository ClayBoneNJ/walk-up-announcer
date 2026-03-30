import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/walk-up-announcer/",
  plugins: [react()],
});
