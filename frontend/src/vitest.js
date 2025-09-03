/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setup-tests.jsx', // Points to our new setup file
    css: true, // If you have component tests that rely on CSS
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Alias for simplifying import paths
    },
  },
  server: {
    // This proxy is useful in development to forward API requests to your backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Assuming your backend runs on port 3000
        changeOrigin: true,
      },
    },
  },
});
