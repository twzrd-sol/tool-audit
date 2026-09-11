import type { MonidRun } from './types.js';

export function getProviderHttpStatus(run: MonidRun): number | undefined {
  const status = run.providerResponse?.httpStatus;
  return Number.isInteger(status) ? status : undefined;
}

export function getUsdCost(run: MonidRun): number | undefined {
  if (
    run.cost?.currency === 'USD' &&
    Number.isFinite(run.cost.value) &&
    run.cost.value >= 0
  ) {
    return run.cost.value;
  }
  return undefined;
}

export function describeReceipt(run: MonidRun): string {
  return `${run.status} / HTTP ${String(run.providerResponse?.httpStatus)}`;
}

export function isSuccessfulUsdReceipt(run: MonidRun): boolean {
  const httpStatus = getProviderHttpStatus(run);
  return (
    run.status === 'COMPLETED' &&
    httpStatus !== undefined &&
    httpStatus >= 200 &&
    httpStatus < 300 &&
    getUsdCost(run) !== undefined
  );
}
