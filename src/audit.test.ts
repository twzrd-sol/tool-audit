import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolAuditor } from './auditor.js';
import type { MonidEndpoint } from './types.js';

test('ToolAuditor: approves secure, bounded endpoints', () => {
  const auditor = new ToolAuditor();
  const safeTool: MonidEndpoint = {
    id: 'test/safe-tool',
    name: 'Safe Tool',
    provider: 'Safe Corp',
    description: 'A completely safe tool',
    url: 'https://api.monid.ai/v1/proxy/safe',
    method: 'POST',
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.005
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  };

  const verdict = auditor.audit(safeTool);
  assert.equal(verdict.status, 'APPROVED');
  assert.equal(verdict.score, 100);
  assert.equal(verdict.findings.length, 0);
  assert.ok(verdict.auditHash.length === 64);
});

test('ToolAuditor: blocks insecure plaintext HTTP endpoints', () => {
  const auditor = new ToolAuditor();
  const httpTool: MonidEndpoint = {
    id: 'test/http-tool',
    name: 'Insecure Tool',
    provider: 'Insecure Corp',
    description: 'Unencrypted endpoint',
    url: 'http://api.monid.ai/v1/proxy/http',
    method: 'POST',
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.005
    },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } }
    }
  };

  const verdict = auditor.audit(httpTool);
  assert.equal(verdict.status, 'BLOCKED');
  assert.ok(verdict.score <= 50);
  assert.ok(verdict.findings.some(f => f.code === 'INSECURE_TRANSPORT'));
});

test('ToolAuditor: flags credentials in URL query parameters', () => {
  const auditor = new ToolAuditor();
  const leakyTool: MonidEndpoint = {
    id: 'test/leak-tool',
    name: 'Leaky Tool',
    provider: 'Leaky Corp',
    description: 'Exposes token in query param',
    url: 'https://api.monid.ai/v1/proxy/leak?api_key=SECRET_TOKEN',
    method: 'GET',
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 0.005
    },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } }
    }
  };

  const verdict = auditor.audit(leakyTool);
  assert.ok(verdict.status === 'WARNED' || verdict.status === 'BLOCKED');
  assert.ok(verdict.findings.some(f => f.code === 'QUERY_AUTH_LEAKAGE'));
});

test('ToolAuditor: blocks spend ceiling breaches', () => {
  const auditor = new ToolAuditor({ maxPricePerCallUsd: 0.05 });
  const expensiveTool: MonidEndpoint = {
    id: 'test/expensive-tool',
    name: 'Expensive Tool',
    provider: 'Gold Corp',
    description: 'Charges $2 per call',
    url: 'https://api.monid.ai/v1/proxy/gold',
    method: 'POST',
    pricing: {
      model: 'per-call',
      rawType: 'PER_CALL',
      baseFeeUsd: 2.00
    },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } }
    }
  };

  const verdict = auditor.audit(expensiveTool);
  assert.equal(verdict.status, 'BLOCKED');
  assert.ok(verdict.findings.some(f => f.code === 'PRICE_CEILING_BREACH'));
});

test('ToolAuditor: flags unbounded per-result billing multipliers', () => {
  const auditor = new ToolAuditor();
  const unboundedTool: MonidEndpoint = {
    id: 'test/unbounded-tool',
    name: 'Unbounded Multiplier',
    provider: 'Meter Corp',
    description: 'Charges per result without limit property',
    url: 'https://api.monid.ai/v1/proxy/meter',
    method: 'POST',
    pricing: {
      model: 'per-result',
      rawType: 'PER_RESULT',
      baseFeeUsd: 0.01,
      unitFeeUsd: 0.02
    },
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } } // no limit or max_results!
    }
  };

  const verdict = auditor.audit(unboundedTool);
  assert.ok(verdict.findings.some(f => f.code === 'UNBOUNDED_RESULT_BILLING'));
});
