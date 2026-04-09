type RepoStatus = {
  branch: string;
  aheadBy: number;
  behindBy: number;
  openPullRequests: number;
  failedWorkflows: number;
};

const MOCK_STATUS: RepoStatus = {
  branch: "release/hardening",
  aheadBy: 1,
  behindBy: 4,
  openPullRequests: 5,
  failedWorkflows: 2
};

export function inspectRepository(repoName: string): string {
  return [
    `repo=${repoName}`,
    `branch=${MOCK_STATUS.branch}`,
    `ahead=${MOCK_STATUS.aheadBy}`,
    `behind=${MOCK_STATUS.behindBy}`,
    `open_prs=${MOCK_STATUS.openPullRequests}`,
    `failed_workflows=${MOCK_STATUS.failedWorkflows}`
  ].join(" | ");
}

// FIXME: Add retries and backoff when API limits are reached.
