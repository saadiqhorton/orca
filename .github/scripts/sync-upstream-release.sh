#!/usr/bin/env bash
set -euo pipefail

SYNC_BRANCH="${SYNC_BRANCH:-cross-host-groups-cloud}"
UPSTREAM_REPO="${UPSTREAM_REPO:-stablyai/orca}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-https://github.com/${UPSTREAM_REPO}.git}"

git_identity() {
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
}

write_output() {
  local key="$1"
  local value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
  fi
}

latest_release_tag() {
  gh api "repos/${UPSTREAM_REPO}/releases/latest" --jq .tag_name
}

report_failure() {
  local title="$1"
  local body="$2"
  if gh issue create --repo "${GITHUB_REPOSITORY:?}" --title "$title" --body "$body"; then
    return 0
  fi
  # This fork has issues disabled; keep a report branch and open or update a PR.
  local report_branch='sync/upstream-release-report'
  git fetch origin "$SYNC_BRANCH"
  git checkout -B "$report_branch" "origin/${SYNC_BRANCH}"
  git_identity
  mkdir -p .github
  printf '%s\n' "$body" >.github/sync-upstream-release-report.md
  git add .github/sync-upstream-release-report.md
  git commit -m "$title" || true
  git push -u origin "$report_branch" --force-with-lease || git push -u origin "$report_branch"
  local existing
  existing="$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$report_branch" --base "$SYNC_BRANCH" --state open --json number --jq '.[0].number // empty')"
  if [ -n "$existing" ]; then
    gh pr edit "$existing" --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body"
  else
    gh pr create --repo "$GITHUB_REPOSITORY" --base "$SYNC_BRANCH" --head "$report_branch" --title "$title" --body "$body"
  fi
}

cmd_rebase() {
  git_identity
  local tag
  tag="$(latest_release_tag)"
  [[ "$tag" =~ ^v?[0-9] ]] || {
    echo "::error::Could not resolve the latest ${UPSTREAM_REPO} release tag"
    exit 1
  }
  git remote add upstream "$UPSTREAM_REMOTE" 2>/dev/null || git remote set-url upstream "$UPSTREAM_REMOTE"
  git fetch --no-tags upstream "+refs/tags/${tag}:refs/tags/${tag}"
  local onto
  onto="$(git rev-parse "${tag}^{commit}")"
  write_output tag "$tag"
  write_output onto "$onto"
  if git merge-base --is-ancestor "$onto" HEAD; then
    echo "Already based on ${UPSTREAM_REPO} ${tag} (${onto})"
    write_output changed false
    return 0
  fi
  local before
  before="$(git rev-parse HEAD)"
  if ! git rebase --onto "$onto" "$(git merge-base HEAD "$onto")"; then
    local log
    log="$(git diff --name-only --diff-filter=U || true)"
    git rebase --abort || true
    report_failure \
      "cross-host-groups-cloud failed to rebase onto ${tag}" \
      "$(printf 'Rebase onto `%s` (%s) hit conflicts.\n\nUnmerged paths:\n```\n%s\n```\n' "$tag" "$onto" "$log")"
    exit 1
  fi
  if [ "$(git rev-parse HEAD)" = "$before" ]; then
    write_output changed false
    return 0
  fi
  write_output changed true
}

cmd_push() {
  git push --force-with-lease="refs/heads/${SYNC_BRANCH}:$(git rev-parse "origin/${SYNC_BRANCH}")" origin "HEAD:refs/heads/${SYNC_BRANCH}"
}

cmd_report() {
  report_failure "$1" "$2"
}

usage() {
  echo "usage: $0 rebase | push | report <title> <body>" >&2
  exit 2
}

case "${1:-}" in
  rebase) cmd_rebase ;;
  push) cmd_push ;;
  report)
    shift
    [ "${1:-}" ] && [ "${2:-}" ] || usage
    cmd_report "$1" "$2"
    ;;
  *) usage ;;
esac
