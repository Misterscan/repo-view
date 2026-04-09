import { calculateReleaseRisk, estimateReviewMinutes } from "./utils/priceCalculator";
import { inspectRepository } from "./services/githubInspector";

const changedFiles = 27;
const failingChecks = 4;
const risk = calculateReleaseRisk(changedFiles, failingChecks);
const reviewMinutes = estimateReviewMinutes(changedFiles);

console.log("Release risk score:", risk);
console.log("Estimated review minutes:", reviewMinutes);
console.log("Repository summary:", inspectRepository("demo-repo"));

// TODO: Emit risk telemetry to analytics endpoint.
