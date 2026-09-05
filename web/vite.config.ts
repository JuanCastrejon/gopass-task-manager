import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /**
     * El cliente siempre pide a `/api`, una ruta relativa.
     * En desarrollo este proxy la reenvía a la API local; dentro de Docker
     * lo hace nginx. Así no hay configuración de CORS por ambiente ni la
     * URL del backend acaba dentro del bundle.
     */
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
