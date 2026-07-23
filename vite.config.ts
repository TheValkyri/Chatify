import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Configuration for Chatify bundler and SSR runner using TanStack Start
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts for SSR error intercepting
    server: { entry: "server" },
  },
});
