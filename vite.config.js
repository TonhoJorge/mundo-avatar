import { defineConfig } from 'vite';

// Política de segurança aplicada no build (no dev atrapalharia o HMR).
// Imagens: qualquer https (fotos do Avatar Wiki, fotos de perfil do GitHub e
// do Supabase, imagens enviadas nas contribuições). Conexões: só o Supabase
// (dados, login e notificações em tempo real). Áudio/vídeo: Supabase.
// Players embutidos: só YouTube (sem rastreio) e Vimeo.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data: https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // o worker do MapLibre (.mjs) sai como .js para qualquer servidor entregar com MIME de JavaScript
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? '';
          return name.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  plugins: [
    {
      name: 'mundo-avatar-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
});
