import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [tailwindcss(), react()],
  build: {
    target: 'esnext',
    sourcemap: false,
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'icons-vendor',
              test: /node_modules[\\/]@phosphor-icons[\\/]/,
            },
          ],
        },
      },
    },
  },
});
