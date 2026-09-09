import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Reports and test logs are not application inputs. Writing them must not
    // reload an in-progress race or continuously rebuild the scene gallery.
    watch: { ignored: ["**/output/**", "**/docs/**"] },
    proxy: {
      "/api": "http://127.0.0.1:2567",
      "/matchmake": "http://127.0.0.1:2567",
      "/socket": {
        target: "ws://127.0.0.1:2567",
        ws: true,
        rewrite: (p) => p.replace(/^\/socket/, ""),
      },
    },
  },
  build: { chunkSizeWarningLimit: 800,rollupOptions:{input:{main:'index.html',reference:'reference.html'}} },
});
