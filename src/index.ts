import { ToolAuditor } from './auditor.js';
import { MonidClient } from './monid.js';
import { describeReceipt, isSuccessfulUsdReceipt } from './receipt.js';
import type { MonidEndpoint, AuditPolicy, AuditVerdict, MonidRun } from './types.js';

export * from './types.js';
export * from './auditor.js';
export * from './monid.js';
export * from './receipt.js';
export * from './vendor-prescreen.js';

export interface AuditAndExecuteResult {
  step: 'DISCOVER' | 'INSPECT' | 'AUDIT' | 'EXECUTE' | 'REFUSED';
  tool?: MonidEndpoint;
  verdict?: AuditVerdict;
  execution?: MonidRun;
  refusalReason?: string;
}

function refusalReason(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown pre-spend failure.';
}

/**
 * Free consume path: discover a Monid endpoint, inspect its exact schema and
 * pricing, then evaluate the local policy. This function never runs or pays
 * for an endpoint.
 */
export async function discoverInspectAndAudit(
  taskQuery: string,
  policy?: Partial<AuditPolicy>,
  monidApiKey?: string
): Promise<AuditAndExecuteResult> {
  const client = new MonidClient(monidApiKey);
  const auditor = new ToolAuditor(policy);

  try {
    const candidates = await client.discover(taskQuery);
    if (candidates.length === 0) {
      return {
        step: 'REFUSED',
        refusalReason: `No candidate endpoints discovered for query '${taskQuery}'.`
      };
    }

    const requestedId = candidates[0].id;
    const tool = await client.inspect(requestedId);
    if (!tool) {
      return {
        step: 'REFUSED',
        refusalReason: `Failed to inspect tool metadata for '${requestedId}'.`
      };
    }
    if (tool.id !== requestedId) {
      return {
        step: 'REFUSED',
        refusalReason: `Inspect identity mismatch: requested ${requestedId}, received ${tool.id}.`
      };
    }

    const verdict = auditor.audit(tool);
    if (verdict.status === 'BLOCKED') {
      return {
        step: 'REFUSED',
        tool,
        verdict,
        refusalReason: `Pre-spend audit failed with score ${verdict.score}/100. Spending was not attempted.`
      };
    }

    return { step: 'AUDIT', tool, verdict };
  } catch (error) {
    return { step: 'REFUSED', refusalReason: refusalReason(error) };
  }
}

export interface ExecuteWithAuditOptions {
  confirmSpend: true;
  policy?: Partial<AuditPolicy>;
  monidApiKey?: string;
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
  options: ExecuteWithAuditOptions
): Promise<AuditAndExecuteResult> {
  if (options?.confirmSpend !== true) {
    return {
      step: 'REFUSED',
      refusalReason: 'Paid execution requires confirmSpend: true.'
    };
  }

  const audited = await discoverInspectAndAudit(
    taskQuery,
    options.policy,
    options.monidApiKey
  );
  if (audited.step === 'REFUSED' || !audited.tool || !audited.verdict) return audited;

  try {
    const client = new MonidClient(options.monidApiKey);
    const execution = await client.run(audited.tool.id, executionParams);
    if (!isSuccessfulUsdReceipt(execution)) {
      return {
        step: 'REFUSED',
        tool: audited.tool,
        verdict: audited.verdict,
        execution,
        refusalReason: `Monid run ${execution.runId} lacked a successful 2xx USD receipt (${describeReceipt(execution)}).`
      };
    }
    return {
      step: 'EXECUTE',
      tool: audited.tool,
      verdict: audited.verdict,
      execution
    };
  } catch (error) {
    return {
      step: 'REFUSED',
      tool: audited.tool,
      verdict: audited.verdict,
      refusalReason: refusalReason(error)
    };
  }
}
