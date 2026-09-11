import type { MonidEndpoint, MonidRun, MonidRunStatus } from './types.js';

type FetchLike = typeof fetch;

interface JsonSchema {
  type?: string;
  properties?: MonidEndpoint['inputSchema']['properties'];
  required?: string[];
}

interface RawEndpoint {
  provider?: string;
  providerName?: string;
  endpoint?: string;
  description?: string;
  summary?: string;
  method?: string;
  input?: {
    pathParams?: JsonSchema;
    queryParams?: JsonSchema;
    body?: JsonSchema;
  };
  price?: {
    type?: string;
    amount?: { value?: number; currency?: string };
    flatFee?: { value?: number; currency?: string };
    notes?: string[];
  };
}

const TERMINAL_STATUSES = new Set<MonidRunStatus>([
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'STOPPED',
  'TIMED_OUT'
]);

export class MonidConfigurationError extends Error {
  constructor() {
    super('Monid credentials are required. Set MONID_API_KEY (or MONID_API) before discovery, inspection, or execution.');
    this.name = 'MonidConfigurationError';
  }
}

export class MonidApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'MonidApiError';
  }
}

export class MonidPendingRunError extends Error {
  constructor(public readonly runId: string) {
    super(`Monid run ${runId} is still pending; reconcile it with GET /v1/runs/${runId}.`);
    this.name = 'MonidPendingRunError';
  }
}

function messageFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return 'Monid API request failed';
}

function parseToolId(toolId: string): { provider: string; endpoint: string } {
  const separator = toolId.indexOf(':');
  if (separator <= 0 || separator === toolId.length - 1) {
    throw new Error(`Invalid Monid tool id '${toolId}'. Expected '<provider>:</endpoint>'.`);
  }
  return {
    provider: toolId.slice(0, separator),
    endpoint: toolId.slice(separator + 1)
  };
}

export class MonidClient {
  private apiKey?: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(
    apiKey?: string,
    baseUrl = 'https://api.monid.ai/v1',
    fetchImpl: FetchLike = globalThis.fetch
  ) {
    this.apiKey = apiKey === undefined
      ? process.env.MONID_API_KEY || process.env.MONID_API
      : apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new MonidConfigurationError();
    return this.apiKey;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new MonidApiError(response.status, 'Monid returned a non-JSON response.');
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.requireApiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new MonidApiError(response.status, messageFromPayload(payload));
    }
    return payload;
  }

  private normalizeEndpoint(raw: RawEndpoint): MonidEndpoint {
    const provider = String(raw.provider || 'unknown');
    const endpoint = String(raw.endpoint || '');
    if (provider === 'unknown' || !endpoint.startsWith('/')) {
      throw new MonidApiError(502, 'Monid endpoint response omitted a valid provider or endpoint path.');
    }
    const price = raw.price || {};
    const amount = price.amount || {};
    const input = raw.input || {};
    const schemas = [input.pathParams, input.queryParams, input.body].filter(
      (schema): schema is JsonSchema => Boolean(schema)
    );
    const inputSchema: MonidEndpoint['inputSchema'] = {
      type: 'object',
      properties: Object.assign({}, ...schemas.map(schema => schema.properties || {})),
      required: [...new Set(schemas.flatMap(schema => schema.required || []))]
    };
    const rawType = String(price.type || 'UNKNOWN').toUpperCase();
    const method = String(raw.method || 'POST').toUpperCase();
    const supportedMethod = ['GET', 'POST', 'PUT', 'DELETE'].includes(method)
      ? method as MonidEndpoint['method']
      : 'POST';

    let model: MonidEndpoint['pricing']['model'] = 'unsupported';
    let baseFeeUsd = -1;
    let unitFeeUsd: number | undefined;
    if (rawType === 'PER_CALL') {
      model = 'per-call';
      baseFeeUsd = Number(amount.value ?? -1);
    } else if (rawType === 'PER_RESULT') {
      model = 'per-result';
      baseFeeUsd = Number(price.flatFee?.value ?? 0);
      unitFeeUsd = Number(amount.value ?? -1);
    }

    return {
      id: `${provider}:${endpoint}`,
      name: raw.providerName || provider,
      provider,
      description: raw.description || raw.summary || '',
      url: `${this.baseUrl}/run`,
      method: supportedMethod,
      inputSchema,
      pricing: {
        model,
        rawType,
        baseFeeUsd,
        ...(unitFeeUsd === undefined ? {} : { unitFeeUsd }),
        ...(price.notes ? { notes: price.notes } : {})
      }
    };
  }

  public async discover(query: string, limit = 10): Promise<MonidEndpoint[]> {
    const trimmed = query.trim();
    if (!trimmed) throw new Error('Discovery query cannot be empty.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 40) {
      throw new Error('Discovery limit must be an integer from 1 to 40.');
    }
    const payload = await this.post('/discover', { query: trimmed, limit }) as {
      results?: RawEndpoint[];
    };
    if (!Array.isArray(payload.results)) {
      throw new MonidApiError(502, 'Monid discover response did not contain a results array.');
    }
    return payload.results.map(item => this.normalizeEndpoint(item));
  }

  public async inspect(toolId: string): Promise<MonidEndpoint | null> {
    const { provider, endpoint } = parseToolId(toolId);
    const payload = await this.post('/inspect', { provider, endpoint }) as RawEndpoint;
    return this.normalizeEndpoint(payload);
  }

  public async getRun(runId: string): Promise<MonidRun> {
    const response = await this.fetchImpl(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`, {
      headers: { 'Authorization': `Bearer ${this.requireApiKey()}` }
    });
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new MonidApiError(response.status, messageFromPayload(payload));
    }
    return this.normalizeRun(payload);
  }

  private normalizeRun(payload: unknown): MonidRun {
    if (!payload || typeof payload !== 'object') {
      throw new MonidApiError(502, 'Monid run response was not an object.');
    }
    const run = payload as Partial<MonidRun>;
    if (!run.runId || !run.provider || !run.endpoint || !run.status) {
      throw new MonidApiError(502, 'Monid run response omitted required identity fields.');
    }
    if (
      !TERMINAL_STATUSES.has(run.status) &&
      !['READY', 'RUNNING', 'STOPPING'].includes(run.status)
    ) {
      throw new MonidApiError(502, `Monid returned unknown run status '${run.status}'.`);
    }
    return run as MonidRun;
  }

  public async run(
    toolId: string,
    input: Record<string, unknown>,
    options: { wait?: boolean; timeoutMs?: number; pollMs?: number } = {}
  ): Promise<MonidRun> {
    const { provider, endpoint } = parseToolId(toolId);
    const response = await this.fetchImpl(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.requireApiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider, endpoint, input })
    });
    const payload = await this.readJson(response);
    const hasRunIdentity = Boolean(
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).runId
    );
    if (!response.ok && !hasRunIdentity) {
      throw new MonidApiError(response.status, messageFromPayload(payload));
    }

    const run = this.normalizeRun(payload);
    if (options.wait === false || TERMINAL_STATUSES.has(run.status)) return run;

    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Monid run timeoutMs must be positive.');
    }
    if (!Number.isFinite(pollMs) || pollMs <= 0) {
      throw new Error('Monid run pollMs must be positive.');
    }
    const deadline = Date.now() + timeoutMs;
    let latest = run;
    while (!TERMINAL_STATUSES.has(latest.status)) {
      if (Date.now() >= deadline) throw new MonidPendingRunError(run.runId);
      await new Promise(resolve => setTimeout(resolve, pollMs));
      latest = await this.getRun(run.runId);
    }
    return latest;
  }
}
