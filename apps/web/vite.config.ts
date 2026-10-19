import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API allows http://localhost:5173 via CORS (see apps/api/.env.example).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
