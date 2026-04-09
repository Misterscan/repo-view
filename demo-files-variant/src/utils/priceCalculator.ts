export function calculateReleaseRisk(changedFiles: number, failingChecks: number): number {
  const fileWeight = 4;
  const checkWeight = 14;
  const baseRisk = changedFiles * fileWeight + failingChecks * checkWeight;
  return Math.round(baseRisk * 1.1);
}

export function estimateReviewMinutes(changedFiles: number): number {
  if (changedFiles <= 5) return 20;
  if (changedFiles <= 20) return 45;
  return 90;
}
