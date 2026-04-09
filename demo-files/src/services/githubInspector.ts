type RepoStatus = {
  branch: string;
  aheadBy: number;
  behindBy: number;
  openPullRequests: number;
};

const MOCK_STATUS: RepoStatus = {
  branch: "feature/demo",
  aheadBy: 3,
  behindBy: 1,
  openPullRequests: 2
};

export function inspectRepository(repoName: string): string {
  return [
    `repo=${repoName}`,
    `branch=${MOCK_STATUS.branch}`,
    `ahead=${MOCK_STATUS.aheadBy}`,
    `behind=${MOCK_STATUS.behindBy}`,
    `open_prs=${MOCK_STATUS.openPullRequests}`
  ].join(" | ");
}

// FIXME: Add pagination support for repositories with more than 100 pull requests.
