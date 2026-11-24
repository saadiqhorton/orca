# Review notes — `upstream/cross-host-orchestration`

Findings from implementer self-review and independent reviewer passes. Resolutions stay next to each item.

## Scope check

| Item                                                   | Status                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Any-host CLI start/message/read/stop via desktop hub   | Implemented (`--host`, hub call/answer, handle locate)                                              |
| `orca host inventory`                                  | Implemented                                                                                         |
| Same-name group merge + `--group`                      | Implemented (sidebar name-path clusters; CLI `--group`; twin create/rename/delete; membership drag) |
| First-turn rejection, exit 5, dispatch keep, pure JSON | Implemented (schema v52 `blocked_reason`)                                                           |
| Desktop host name as `--host`                          | Implemented (catalog includes desktop row; local name de-duped in `host list`)                      |
| External agents outside an Orca terminal               | CLI bind does not require `ORCA_TERMINAL_HANDLE`; inventory-first skills                            |
| Remote bot @mentions (#45831)                          | **Follow-up** — composer still lists `--on` paired-server bots only                                 |
| Skills / docs / release-note text                      | Bundled guides + `docs/site/content/docs/cli/{overview,orchestration,reference}.mdx`                |

## Correctness

- `--on` stays federation; `--environment` stays execute-there; `--host` is desktop-hub. Mixing `--host` with `--on` or `--environment` is refused.
- Hub control-plane methods (`orchestration.desktopHub.*`) cannot be forwarded through `desktopHub.call`.
- `worker-show` / dispatch-scoped commands stay on the Run home; `--host` is ignored.
- Unique handles auto-route; collisions name owners.
- `agent.launch` / `agent.launchReplay` resolve `group:` / `same-group:` / scratch via `placeAuthorizedAgentLaunch` before admission.
- Moving a project into a group on another machine creates or reuses a same-named twin in the project's catalog. Rename and delete apply to every twin drawn under that header. Dragging a project header onto a group joins it in every repo sort mode.

## Security / authz

- `orchestration.desktopHub.answer` requires `pairedDeviceId` and only the registered volunteer.
- Inventory and list are `localOnly` workspace RPCs (authenticated CLI session), not a secret channel.
- Scratch paths refuse `..` / separators; Windows uses `path` joins and `%USERPROFILE%`.
- Residual risk: confirm `desktopHub.call` cannot invoke privileged methods beyond what the caller’s session could invoke locally. Reviewers should grep forwarded method allow/deny.

## Windows

- Scratch root is `orca-orchestration` under homedir (`path.join`, split on `[/\\]`).
- `--shell` on `terminal create` still uses the existing Windows shell override list.
- `pnpm tc` bun composite is required so Node tests do not import `src/cli/output` (TS6307).

## Backwards compatibility

- Older hosts without hub RPCs: `host inventory` maps `method_not_found` to `incompatible_runtime`; `host list` omits execution rows.
- `--on` / `--environment` / SSH `--host ssh:` unchanged.
- Schema v52 is additive.

## Process / stack

Implementers landed on this branch in reviewable commits (hub volunteer, first-turn, skills/docs, inventory RPCs, group clustering). Upstream may want that as a **stack of 3–4 PRs** rather than one. Do not open a PR on `stablyai/orca` from this work; Saadiq reviews first.

## Independent reviewers

Fill in after each pass. Blocking issues must be fixed before push is considered done.

### Correctness reviewer

- Status:
- Blocking:
- Resolutions:

### Security reviewer

- Status:
- Blocking:
- Resolutions:

### Windows / paths reviewer

- Status:
- Blocking:
- Resolutions:

### Backwards-compat reviewer

- Status:
- Blocking:
- Resolutions:

### Whole-diff reviewer

- Status:
- Blocking:
- Resolutions:
