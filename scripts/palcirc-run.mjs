// Runs a TypeScript dev script through Vite's SSR loader (so extensionless imports resolve).
//   node scripts/palcirc-run.mjs scripts/palcirc-terrain.ts <args…>
import { createServer } from 'vite';
const [, , file, ...rest] = process.argv;
process.argv = [process.argv[0], file, ...rest];
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  await server.ssrLoadModule('/' + file.replace(/^\.?\//, ''));
} finally {
  await server.close();
}
