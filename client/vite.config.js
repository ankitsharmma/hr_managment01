import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST || '0.0.0.0',
      port: Number(env.VITE_DEV_PORT) || 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: false
        }
      }
    }
  };
});