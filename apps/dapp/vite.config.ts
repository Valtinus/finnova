import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The DApp reuses the web app's design system (see src/ui.ts). Dedupe React so components
// imported from apps/web share this app's React instance.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5174, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { ethers: ["ethers"] } } } },
});
