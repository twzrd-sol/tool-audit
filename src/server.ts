import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ToolAuditor } from './auditor.js';
import type { MonidEndpoint } from './types.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY_BYTES = 256 * 1024;
const auditor = new ToolAuditor();

const measuredDemo = {
  schema: 'tool-audit.measured-demo.v1',
  measuredAt: '2026-09-11T01:02:11.304Z',
  targetUrl: 'https://monid.ai',
  incumbent: {
    name: 'Vendorapp Startup',
    pricingUrl: 'https://vendorapp.co/pricing/',
    monthlyPriceUsd: 149,
    includedPrescreens: 200,
    freeTierPrescreens: 15
  },
  verdict: 'review_required',
  receipts: [
    {
      purpose: 'incumbent_price',
      runId: '01M26ZQCF2RTDKB9WQ5XBQX3EW',
      provider: 'context.dev',
      endpoint: '/web/scrape/markdown',
      costUsd: 0.0009
    },
    {
      purpose: 'security_headers',
      runId: '01M26ZRF377CFWF9SAQF94MHXD',
      provider: 'api.strale.io',
      endpoint: '/x402/header-security-check',
      costUsd: 0.0594
    },
    {
      purpose: 'cookie_consent',
      runId: '01M26ZRWB37QR0XZ72ED0KESAJ',
      provider: 'api.strale.io',
      endpoint: '/x402/v2/cookie-scan',
      costUsd: 0.1782
    }
  ],
  measuredCostUsd: 0.2385,
  limitations: [
    'The cookie scan analyzed partial HTML and did not observe JavaScript-set cookies.',
    'This replaces first-pass evidence collection, not monitoring, remediation, contracts, or human judgment.'
  ],
  liveDemoUrl: 'https://twzrd-sol.github.io/tool-audit/',
  sourceUrl: 'https://github.com/twzrd-sol/tool-audit'
} as const;

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
    response.writeHead(302, { Location: measuredDemo.liveDemoUrl });
    response.end();
    return;
  }

  json(response, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tool-audit listening on http://127.0.0.1:${PORT}`);
});
