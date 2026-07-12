import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  /* '/' e não './': as rotas são reais (/comparador, /taxa-pre), então caminho
     relativo faria o browser procurar os assets em /comparador/assets/… e quebrar. */
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2018',
    rollupOptions: {
      output: {
        /* recharts + react são ~90% do peso e quase nunca mudam. Em chunk próprio,
           editar uma calculadora não invalida o cache deles no navegador. */
        manualChunks: { vendor: ['react', 'react-dom', 'recharts'] },
      },
    },
  },
  server: { port: 5173, open: true },
});
