import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/files/space-combat/",
  plugins: [react()],
  resolve: {
    conditions: ["development", "browser", "module", "import"],
  },
  server: {
    host: true,
    port: 5173,
  },
});
