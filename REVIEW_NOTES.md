# Review notes — `upstream/cross-host-orchestration`

Findings from implementer self-review and independent reviewer passes. Resolutions stay next to each item.

Independent reviewers read SHA `4534d6bd012` (pre-rebase). Later commits addressed their blocking items. A whole-diff pass at `5b937d42040` found two more blocking wiring holes, fixed in the following commit.

Rebased onto current `stablyai/orca` `main` (`6f44d18f022`, 26 commits including paired-server port forwards). Overlap was `rpc-method-registry.ts`, `app-lifetime-ipc-bridge.ts`, generated catalog/`en.json`, and `terminal-send.ts` (kept upstream's `terminal` local). `--on` / `--environment` / bot groups stay the upstream paths; hub is additive. `pnpm check:changed --base=upstream/main` after rebase: **46/46**.

## Scope check

| Item                                                   | Status                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Any-host CLI start/message/read/stop via desktop hub   | Implemented (`--host`, hub call/answer, handle locate)                                                                               |
| `orca host inventory`                                  | Implemented                                                                                                                          |
| Same-name group merge + `--group`                      | Implemented (sidebar name-path clusters; CLI `--group`; twin create/rename/delete; membership drag)                                  |
| First-turn rejection, exit 5, dispatch keep, pure JSON | Implemented (schema v52 `blocked_reason`)                                                                                            |
| Desktop host name as `--host`                          | Implemented (catalog includes desktop row; CLI skips wrap on the hub itself; `dispatchLocalRpc` when the catalog names this desktop) |
| External agents outside an Orca terminal               | CLI bind does not require `ORCA_TERMINAL_HANDLE`; inventory-first skills; Claude owned instruction argv                              |
| Remote bot @mentions (#45831)                          | **Follow-up** — composer still lists `--on` paired-server bots only                                                                  |
| Skills / docs / release-note text                      | Bundled guides + `docs/site/content/docs/cli/{overview,orchestration,reference}.mdx`                                                 |

## Correctness

- `--on` stays federation; `--environment` stays execute-there; `--host` is desktop-hub. Mixing `--host` with `--on` or `--environment` is refused on orchestration commands.
- Hub control-plane methods (`orchestration.desktopHub.*`) cannot be forwarded through `desktopHub.call`.
- `worker-show` / dispatch-scoped commands stay on the Run home; `--host` is ignored. Bare `ctx_` send addresses stay on the Run home even when `--host` is set.
- Unique handles auto-route; collisions name owners.
- `agent.launch` / `agent.launchReplay` resolve `group:` / `same-group:` / scratch via `placeAuthorizedAgentLaunch` before admission, and refuse an unsupported Codex model before the ledger opens.
- Moving a project into a group on another machine creates or reuses a same-named twin in the project's catalog. Rename and delete apply to every twin drawn under that header. Dragging a project header onto a group joins it in every repo sort mode.

### Correctness reviewer (`4534d6bd012`) — blocking, then fixed

| Finding                                                                                                            | Resolution                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| On the desktop hub itself, `--host <desktop-name>` for wrapped commands threw `Missing host for desktop hub call`. | `bindDesktopHubHost` returns the local client when the matched row is this desktop. `callDesktopHubHost` uses `dispatchLocalRpc` when the catalog selector is empty. Covered by `desktop-hub-call.test.ts` and `desktop-hub-bind.test.ts`. |

### Whole-diff reviewer (`5b937d42040`) — blocking, then fixed

| Finding                                                                                                                             | Resolution                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker-start --host` rewrote to `--on` then required an exact worktree; `resolveFederatedWorkerWorktree` was never called.         | `routeDesktopHubCommand` keeps `host`. `startFederatedWorker` uses `resolveFederatedStartWorktree` so `--host` can scratch/group-place on the target; classic `--on current` still refuses. |
| `--host <desktop>` from a remote CLI skipped wrap whenever the catalog row was `hostKey=desktop`, so the command ran on the remote. | Skip wrap only when the list RPC is not `hub: 'remote'`. A remote session wraps and hops `desktopHub.call` so the volunteer can `callLocal` on the desktop.                                 |

Non-blocking (left as follow-up, not blocking): `--host` + `--environment` not refused on `agent launch` / `terminal create`; Claude first-turn activity tokens can settle early; `dispatchLocalRpc` is still optional on `callDesktopHubHost` (CLI self-target and volunteer `callLocal` cover the product paths).

## Security / authz

- `orchestration.desktopHub.answer` requires `pairedDeviceId` and only the registered volunteer.
- `orchestration.desktopHub.call` now also `assertCaller`s.
- Inventory and list are `localOnly` workspace RPCs (authenticated CLI session), not a secret channel.
- Scratch paths refuse `..` / separators; Windows uses `path` joins and `%USERPROFILE%`.
- Forwarded methods are allowlisted (`orchestration.` except the hub control plane, plus `agent.` / `terminal.` / `worktree.` / `folderWorkspace.` / `projectGroup.` / `repo.` / `status.` / `session.`). Pairing, accounts, settings, github/gitlab, secrets, and credentials are refused (`forbidden`).
- Hub call envelopes are `.strict()` and stripped to request-id / contract-version / capability on the answer path. `orchestrationPeerRun` cannot ride along.
- Volunteer `stop()` clears `bound` when the last volunteer leaves, so a later client cannot inherit the previous desktop identity.

### Security reviewer (`4534d6bd012`) — blocking, then fixed

| Finding                                            | Resolution                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Unrestricted `desktopHub.call`                     | `assertDesktopHubForwardableMethod` on CLI wrap, server call, and desktop answer. |
| No `assertCaller` on call                          | Added next to list/inventory/locate.                                              |
| Envelope `.passthrough()` / `orchestrationPeerRun` | Strict envelope schema; subscribe path copies only known fields.                  |
| First-binder-wins sticky `bound` after `stop()`    | `bound` is cleared when the volunteer list is empty.                              |

Residual risk: `dispatchLocal` on the desktop still runs allowed methods as the owner. That is the product: a connected agent may drive another host through the paired desktop. The allowlist is the fence. Confirm in a two-host smoke that a denied method never reaches the target.

## Windows

- Scratch root is `orca-orchestration` under homedir (`path.join`, split on `[/\\]`).
- `--shell` on `terminal create` still uses the existing Windows shell override list.
- `pnpm tc` bun composite is required so Node tests do not import `src/cli/output` (TS6307). **Passed.**
- Suggested `--host` commands use `quoteCliCommandArgument`.
- Same-group fallback compares paths with `normalizeRuntimePathForComparison` (Windows case/slash fold).
- `--host` matching is case-insensitive.

### Windows reviewer (`4534d6bd012`) — blocking, then fixed

| Finding                                   | Resolution                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Unquoted `--host` in suggested commands   | `quoteCliCommandArgument` in bind, selector-resolve, and host-refusal next-steps. |
| Same-group path prefix was case-sensitive | `normalizeRuntimePathForComparison` on cwd and repo path.                         |

Non-blocking follow-ups: NTFS reserved scratch names; comma in host names vs `ORCA_HOSTS`; live Windows smoke still outstanding.

## Backwards compatibility

- Older hosts without hub RPCs: `host inventory` maps `method_not_found` to `incompatible_runtime`; `host list` omits execution rows.
- `--on` / `--environment` / SSH `--host ssh:` unchanged.
- Schema v52 is additive.
- `--host` is global-optional; `--group` is per-command.

### Backwards-compat reviewer (`4534d6bd012`) — pass with nits

No blocking issues. Nits left documented: bare `--host` is hub-first (prefixed `ssh:` unchanged); `agent launch --host` on an old runtime still surfaces `method_not_found` rather than `incompatible_runtime`; new CLI may inject `same-group:` for `worker-start --on` without `--worktree`.

## Whole-diff

`pnpm check:changed --base=upstream/main`: **46/46 passed** after moving hub e2e helpers to `tests/desktop-hub/`, generating skill/i18n artifacts, and landing the allowlist + desktop self-target + quoting fixes.

`pnpm tc`: passed (node, web, cli, bot-evals; bun composite included).

`ORCA_CODE_QUALITY_BASE=upstream/main pnpm lint`: **49/49** passed. Bare `pnpm lint` is not the gate for this branch — it diffs against fork `origin/main` (~15k files).

Full `pnpm test --maxWorkers=2`: **5070 passed**, 62 skipped, 20 failed on the first run. Six of those were `bot-dispatch-migration.test.ts` still expecting schema 51 after the v52 `blocked_reason` bump (fixed to `SCHEMA_VERSION`). The other failures (`agent-hooks` persistence, session-store receipts, GitHub cache flush, Claude folder login, PTY secret-scan matching hostname `cursor`) are in files this branch does not touch and reproduce in isolation here.

Remaining product follow-ups (not blocking this branch):

- Remote bot @mentions across desktop-hub hosts (#45831)
- Two-host manual smoke (macOS desktop + Linux execution host; Windows host)
- Optional stack split (see PR_DESCRIPTION.md)

## Process / stack

Implementers landed on this branch in reviewable commits (hub volunteer, first-turn, skills/docs, inventory RPCs, group clustering, twins/membership, typecheck remaps, check:changed mechanicals). Upstream may want that as a **stack of 3–4 PRs** rather than one. Do not open a PR on `stablyai/orca` from this work; Saadiq reviews first.
