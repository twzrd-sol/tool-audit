import { ToolAuditor, DEFAULT_AUDIT_POLICY } from './auditor.js';
import { MonidClient, SAMPLE_MONID_CATALOG } from './monid.js';
import type { MonidEndpoint, AuditPolicy, AuditVerdict } from './types.js';

export * from './types.js';
export * from './auditor.js';
export * from './monid.js';

export interface AuditAndExecuteResult {
  step: 'DISCOVER' | 'INSPECT' | 'AUDIT' | 'EXECUTE' | 'REFUSED';
  tool?: MonidEndpoint;
  verdict?: AuditVerdict;
  execution?: {
    status: string;
    result?: unknown;
    chargedUsd?: number;
  };
  refusalReason?: string;
}

/**
 * Main Consume Path:
 * 1. Discover candidates on Monid for given agent intent
 * 2. Inspect target candidate schema & pricing
 * 3. Pre-spend Audit (evaluates security, data egress, and economic bounds)
 * 4. Fails closed if BLOCKED (zero spend, instant refusal audit card)
 * 5. Executes via Monid if APPROVED/WARNED
 */
export async function executeWithAudit(
  taskQuery: string,
  executionParams: Record<string, unknown>,
  policy?: Partial<AuditPolicy>,
  monidApiKey?: string
): Promise<AuditAndExecuteResult> {
  const client = new MonidClient(monidApiKey);
  const auditor = new ToolAuditor(policy);

  // Step 1: Discover
  const candidates = await client.discover(taskQuery);
  if (!candidates || candidates.length === 0) {
    return {
      step: 'REFUSED',
      refusalReason: `No candidate endpoints discovered for query '${taskQuery}'`
    };
  }

  // Step 2: Inspect top candidate
  const candidateId = candidates[0].id;
  const tool = await client.inspect(candidateId);
  if (!tool) {
    return {
      step: 'REFUSED',
      refusalReason: `Failed to inspect tool metadata for '${candidateId}'`
    };
  }

  // Step 3: Run Pre-Spend Audit
  const verdict = auditor.audit(tool);

  // Step 4: Enforce fail-closed gate
  if (verdict.status === 'BLOCKED') {
    return {
      step: 'REFUSED',
      tool,
      verdict,
      refusalReason: `Pre-spend audit FAILED with score ${verdict.score}/100. Critical security or economic bounds breached. Spending aborted.`
    };
  }

  // Step 5: Execute safely
  const execution = await client.run(tool.id, executionParams);
  return {
    step: 'EXECUTE',
    tool,
    verdict,
    execution
  };
}
