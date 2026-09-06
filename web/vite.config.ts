import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `.env` vive en la raíz del repositorio, no en `web/`, porque las mismas
 * variables las consume Docker Compose. Vite no lo carga solo en el archivo
 * de configuración —solo expone `VITE_*` a la aplicación—, así que se lee
 * aquí de forma explícita con prefijo vacío para ver todas las claves.
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, '..', ''), ...process.env };

  const puerto = (valor: string | undefined, defecto: number): number => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 && n < 65_536 ? n : defecto;
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Mismo `WEB_PORT` que publica Docker Compose: la variable significa lo
      // mismo dentro y fuera de contenedores.
      port: puerto(env['WEB_PORT'], 5173),
      proxy: {
        /**
         * El cliente siempre pide a `/api`, una ruta relativa.
         * En desarrollo este proxy la reenvía a la API local; dentro de Docker
         * lo hace nginx. Así no hay configuración de CORS por ambiente ni la
         * URL del backend acaba dentro del bundle.
         *
         * El destino se compone desde `API_PORT` en lugar de estar fijo: antes
         * cambiar `API_PORT` movía la API pero no el proxy, y `npm run dev`
         * devolvía 500 contra un puerto vacío. `API_URL` sigue existiendo como
         * escape para apuntar a una API que no esté en localhost.
         */
        '/api': {
          target: env['API_URL'] ?? `http://localhost:${puerto(env['API_PORT'], 3000)}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
    },
  };
});
