import { calculateReleaseRisk } from "./utils/priceCalculator";
import { inspectRepository } from "./services/githubInspector";

const changedFiles = 14;
const failingChecks = 2;
const risk = calculateReleaseRisk(changedFiles, failingChecks);

console.log("Release risk score:", risk);
console.log("Repository summary:", inspectRepository("demo-repo"));

// TODO: Replace mock console output with UI notification dispatch.
