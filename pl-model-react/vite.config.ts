import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    // DOM量の多い03画面を全スイート並列実行しても、個別テストの正常完了を待てるようにする。
    testTimeout: 20_000,
  },
});
