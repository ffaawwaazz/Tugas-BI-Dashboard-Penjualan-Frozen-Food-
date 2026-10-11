import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // Satu salinan React saja; Radix (tooltip) memakai hook dan crash bila ada dua salinan.
    dedupe: ["react", "react-dom"],
  },
  // Pra-bundel semua dependensi di awal supaya Vite tidak mengoptimasi ulang di tengah jalan
  // (itu yang membuat modul React dan Radix punya hash berbeda di browser).
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "motion/react", "lucide-react", "@radix-ui/react-tooltip"],
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:5174" },
  },
});
