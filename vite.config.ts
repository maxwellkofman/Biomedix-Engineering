import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './server/api.ts';

/** Serves the account API (server/api.ts) from the dev and preview servers, so one command runs everything. */
function accountApi(): Plugin {
  return {
    name: 'biomedix-account-api',
    configureServer(server) {
      // Dev mode: emails go to the mailbox at /dev/mail instead of being sent.
      server.middlewares.use(apiMiddleware({ dev: process.env.BIOMEDIX_DEV !== '0' }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware({ dev: process.env.BIOMEDIX_DEV === '1' }));
    },
  };
}

export default defineConfig({
  plugins: [react(), accountApi()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Microsoft sign-in popup returns here (see src/export/sharepoint.ts).
        redirect: resolve(__dirname, 'redirect.html'),
      },
    },
  },
});
