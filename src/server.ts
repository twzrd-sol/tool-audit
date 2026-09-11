import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolAuditor } from './auditor.js';
import type { MonidEndpoint } from './types.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY_BYTES = 256 * 1024;
const auditor = new ToolAuditor();
const measuredDemo = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence', 'measured-demo.json'),
    'utf8'
  )
) as {
  kind?: string;
  snapshotUrl: string;
  [key: string]: unknown;
};

if (measuredDemo.kind !== 'measured-snapshot' || typeof measuredDemo.snapshotUrl !== 'string') {
  throw new Error('evidence/measured-demo.json must be a labeled measured snapshot with snapshotUrl.');
}

function setHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  setHeaders(response);
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === '/health') {
    json(response, 200, {
      status: 'ok',
      service: 'tool-audit',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (url.pathname === '/v1/demo' && request.method === 'GET') {
    json(response, 200, measuredDemo);
    return;
  }

  if (url.pathname === '/v1/audit' && request.method === 'POST') {
    try {
      const endpoint = await readJsonBody(request) as MonidEndpoint;
      json(response, 200, auditor.audit(endpoint));
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'request_too_large';
      json(response, tooLarge ? 413 : 400, {
        error: tooLarge ? 'request_too_large' : 'invalid_monid_endpoint'
      });
    }
    return;
  }

  if (url.pathname === '/' && request.method === 'GET') {
    response.writeHead(302, { Location: measuredDemo.snapshotUrl });
    response.end();
    return;
  }

  json(response, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tool-audit listening on http://127.0.0.1:${PORT}`);
});
