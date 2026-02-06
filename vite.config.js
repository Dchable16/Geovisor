import { defineConfig } from 'vite';

export default defineConfig({
  // Base path: Ajusta esto si tu repo se llama diferente. 
  // Esto es crucial para que funcione en GitHub Pages.
  base: '/geovisor_vulnerabilidad/', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  server: {
    open: true
  }
});
