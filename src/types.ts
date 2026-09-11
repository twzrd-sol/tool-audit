export interface MonidPricing {
  model: 'per-call' | 'per-result';
  baseFeeUsd: number;
  unitFeeUsd?: number;
}

export interface MonidEndpoint {
  id: string;
  name: string;
  provider: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  inputSchema: {
    type?: string;
    properties?: Record<string, {
      type?: string;
      description?: string;
      default?: unknown;
      enum?: unknown[];
    }>;
    required?: string[];
  };
  outputSchema?: Record<string, unknown>;
  pricing: MonidPricing;
  authType?: 'bearer' | 'api-key' | 'none';
  headers?: Record<string, string>;
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
  vendorRiskReplaced: {
    incumbentProcess: string;
    incumbentTurnaround: string;
    incumbentCost: string;
    toolAuditTurnaround: string;
    toolAuditCost: string;
    savingsPct: string;
  };
  timestamp: string;
  auditHash: string;
}
