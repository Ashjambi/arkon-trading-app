import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: {
          ignored: ['**/settings.json', '**/raw.json', '**/logs.txt']
        },
        proxy: {
          '/api/proxy/market-data': {
            target: 'https://www.deribit.com',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => {
              try {
                const url = new URL(path, 'http://localhost');
                const endpoint = url.searchParams.get('endpoint');
                if (!endpoint) return path;
                url.searchParams.delete('endpoint');
                return `/api/v2/public/${endpoint}${url.search}`;
              } catch (e) {
                return path;
              }
            }
          }
        }
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
