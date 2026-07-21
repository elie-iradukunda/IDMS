import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend (Node + Express + Sequelize + MySQL) runs on :4000.
// In dev we proxy /api to it so the browser talks to one origin and
// there is no CORS friction. In production, point VITE_API_URL at the API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Use 127.0.0.1 (not "localhost") so Windows doesn't resolve to IPv6 ::1
      // and fail with ECONNREFUSED when the API listens on IPv4.
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
