const core = require('@actions/core');
const github = require('@actions/github');

async function main() {
  const token = core.getInput("github_token", { required: true });

  const pull_request = github.context.payload.pull_request;
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const baseline_ref = pull_request.base.ref;
  const baseline = ref_to_coverage_artifact_name(baseline_ref);
  const head_sha = pull_request.head.sha;
  const head_url = pull_request.head.repo.html_url + "/blob/" + head_sha;
  const octokit = github.getOctokit(token);

  const check_suites = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}/check-suites', {
    owner,
    repo,
    ref: head_sha,
  });
  core.info(JSON.stringify(check_suites));
}

main()
