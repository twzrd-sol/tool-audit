export interface MonidPricing {
  model: 'per-call' | 'per-result' | 'unsupported';
  rawType: string;
  currency: string;
  baseFeeUsd: number;
  unitFeeUsd?: number;
  notes?: string[];
}

export interface MonidEndpoint {
  id: string;
  name: string;
  provider: string;
  description: string;
  url: string;
  method: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      default?: unknown;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
    }>;
    required?: string[];
  };
  outputSchema?: Record<string, unknown>;
  pricing: MonidPricing;
  /** Documentation URL as published by Monid. The one operator signal per endpoint. */
  docUrl?: string;
  /** Listing tags as published by Monid, e.g. `verified`. */
  tags?: string[];
  authType?: 'bearer' | 'api-key' | 'none';
  headers?: Record<string, string>;
}

export type MonidRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'STOPPING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'STOPPED'
  | 'TIMED_OUT';

export interface MonidMoney {
  value: number;
  currency: string;
}

export interface MonidRun {
  runId: string;
  provider: string;
  endpoint: string;
  status: MonidRunStatus;
  output?: unknown;
  reason?: string;
  controls?: unknown[];
  providerResponse?: {
    httpStatus?: number;
    error?: unknown;
  };
  price?: {
    type?: string;
    amount?: MonidMoney;
  };
  cost?: MonidMoney;
  billedUnits?: number;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AuditPolicy {
  maxPricePerCallUsd: number;
  requireHttps: boolean;
  disallowQueryAuth: boolean;
  disallowUnboundedResults: boolean;
  enforceTypedSchema: boolean;
}

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingCategory = 'TRANSPORT_SECURITY' | 'CREDENTIAL_HYGIENE' | 'DATA_EGRESS' | 'ECONOMIC_SAFETY' | 'CONTRACT_HONESTY';

export interface AuditFinding {
  code: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface AuditVerdict {
  status: 'APPROVED' | 'WARNED' | 'BLOCKED';
  score: number; // 0 - 100
  toolId: string;
  toolName: string;
  provider: string;
  pricing: MonidPricing;
  maxEstimatedCostUsd: number;
  findings: AuditFinding[];
  timestamp: string;
  auditHash: string;
}

export interface PrescreenRunReceipt {
  purpose: 'incumbent_price' | 'security_headers' | 'cookie_consent';
  runId: string;
  provider: string;
  endpoint: string;
  status: MonidRunStatus;
  costUsd: number;
  currency: 'USD';
  providerHttpStatus: number;
}

export interface VendorPrescreenReport {
  schema: 'tool-audit.vendor-prescreen.v1';
  targetUrl: string;
  incumbent: {
    name: 'Vendorapp Startup';
    pricingUrl: string;
    monthlyPriceUsd: 149;
    includedPrescreens: 200;
    freeTierPrescreens: 15;
    verifiedFromLivePage: boolean;
  };
  verdict: 'review_required' | 'unable_to_verify';
  findings: {
    missingSecurityHeaders: unknown[];
    headerPotentialIssues: string[];
    cookiePotentialIssues: string[];
  };
  receipts: PrescreenRunReceipt[];
  measuredCostUsd: number;
  scope: {
    replaces: string;
    doesNotReplace: string[];
  };
  generatedAt: string;
}
