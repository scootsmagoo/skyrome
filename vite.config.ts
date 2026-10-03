import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from the GitHub Pages subpath (/skyrome/).
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
} as any);
