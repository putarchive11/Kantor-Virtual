import { defineConfig, loadEnv } from 'vite';

// Saat `npm run dev`, /api/agent dilayani langsung oleh fungsi serverless yang sama
// dengan di Vercel, memakai variabel dari file .env.local.
function localApi(mode) {
  return {
    name: 'kantor-local-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MODEL_LITE', 'OFFICE_PASSCODE', 'MOCK_API']) {
        if (env[k] !== undefined) process.env[k] = env[k];
      }
      server.middlewares.use('/api/agent', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/agent.js');
          await mod.default(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [localApi(mode)],
  build: {
    chunkSizeWarningLimit: 2000,
  },
}));
