import workerSource from '@/lib/local-recognition-worker.js?raw';

export function GET() {
  return new Response(workerSource, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
