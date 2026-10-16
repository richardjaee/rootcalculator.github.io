import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative base so the build works under /rootcalculator.github.io/ on GitHub Pages
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: { mathjs: ['mathjs'], katex: ['katex'], react: ['react', 'react-dom', 'framer-motion'] },
      },
    },
  },
});
