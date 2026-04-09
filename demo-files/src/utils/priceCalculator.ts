export function calculateReleaseRisk(changedFiles: number, failingChecks: number): number {
  const fileWeight = 3;
  const checkWeight = 12;
  return changedFiles * fileWeight + failingChecks * checkWeight;
}

export function estimateReviewMinutes(changedFiles: number): number {
  if (changedFiles <= 5) return 15;
  if (changedFiles <= 20) return 35;
  return 60;
}
