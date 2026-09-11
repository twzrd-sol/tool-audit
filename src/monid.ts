import { getProviderHttpStatus, getUsdCost } from './receipt.js';
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
    super('Monid credentials are required. Set MONID_API_KEY before discovery, inspection, or execution.');
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
  constructor(public readonly runId: string, cause?: unknown) {
    super(
      `Monid run ${runId} is not fully reconciled; retrieve it with GET /v1/runs/${runId}.`,
      cause === undefined ? undefined : { cause }
    );
    this.name = 'MonidPendingRunError';
  }
}

export class MonidAmbiguousRunError extends Error {
  constructor(
    public readonly provider: string,
    public readonly endpoint: string,
    cause?: unknown
  ) {
    super(
      `Paid Monid request for ${provider}:${endpoint} failed before a run ID was received. Do not retry blindly; reconcile recent runs first.`,
      cause === undefined ? undefined : { cause }
    );
    this.name = 'MonidAmbiguousRunError';
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
    this.apiKey = apiKey === undefined ? process.env.MONID_API_KEY : apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new MonidConfigurationError();
    return this.apiKey;
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new MonidApiError(408, `Monid API request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.requireApiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, 30_000);
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
    const amountCurrency = String(amount.currency || 'UNKNOWN').toUpperCase();
    const flatFeeCurrency = String(price.flatFee?.currency || amountCurrency).toUpperCase();
    const currency = amountCurrency === flatFeeCurrency ? amountCurrency : 'MIXED';
    const method = String(raw.method || 'UNKNOWN').toUpperCase();

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
      method,
      inputSchema,
      pricing: {
        model,
        rawType,
        currency,
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
    const response = await this.fetchWithTimeout(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`, {
      headers: { 'Authorization': `Bearer ${this.requireApiKey()}` }
    }, 30_000);
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

  private assertRunIdentity(run: MonidRun, provider: string, endpoint: string): void {
    if (run.provider !== provider || run.endpoint !== endpoint) {
      throw new MonidApiError(
        502,
        `Monid run ${run.runId} returned identity ${run.provider}:${run.endpoint}, expected ${provider}:${endpoint}.`
      );
    }
  }

  private assertCompletedReceipt(run: MonidRun): void {
    if (run.status !== 'COMPLETED') return;
    if (getProviderHttpStatus(run) === undefined || getUsdCost(run) === undefined) {
      throw new MonidApiError(
        502,
        `Monid run ${run.runId} omitted an explicit provider HTTP status or USD cost.`
      );
    }
  }

  public async run(
    toolId: string,
    input: Record<string, unknown>,
    options: {
      wait?: boolean;
      timeoutMs?: number;
      pollMs?: number;
      requestTimeoutMs?: number;
    } = {}
  ): Promise<MonidRun> {
    const { provider, endpoint } = parseToolId(toolId);
    const requestTimeoutMs = options.requestTimeoutMs ?? 130_000;
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error('Monid run requestTimeoutMs must be positive.');
    }
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.requireApiKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider, endpoint, input })
      }, requestTimeoutMs);
    } catch (error) {
      throw new MonidAmbiguousRunError(provider, endpoint, error);
    }
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
    this.assertRunIdentity(run, provider, endpoint);
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Monid run timeoutMs must be positive.');
    }
    if (!Number.isFinite(pollMs) || pollMs <= 0) {
      throw new Error('Monid run pollMs must be positive.');
    }
    const deadline = Date.now() + timeoutMs;
    if (options.wait === false) {
      this.assertCompletedReceipt(run);
      return run;
    }

    let latest = run;
    while (
      !TERMINAL_STATUSES.has(latest.status) ||
      (latest.status === 'COMPLETED' && !latest.cost)
    ) {
      if (Date.now() >= deadline) throw new MonidPendingRunError(run.runId);
      await new Promise(resolve => setTimeout(resolve, pollMs));
      try {
        latest = await this.getRun(run.runId);
        this.assertRunIdentity(latest, provider, endpoint);
      } catch (error) {
        throw new MonidPendingRunError(run.runId, error);
      }
    }
    this.assertCompletedReceipt(latest);
    return latest;
  }
}
