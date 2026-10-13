import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built into ui/dist and served by ../serve.py at http://localhost:8000/ui/dist/.
// `npm run dev` proxies data and run endpoints to that server.
const api = { target: "http://localhost:8000" };
export default defineConfig({
  base: "/ui/dist/",
  plugins: [react()],
  server: { proxy: { "/runs": api, "/run": api, "/playbooks": api } },
});
