# Cross-host orchestration (desktop hub)

Draft body for an upstream PR to [stablyai/orca](https://github.com/stablyai/orca). Do **not** open that PR from this branch until Saadiq reviews it internally. Target `upstream/cross-host-orchestration` on `saadiqhorton/orca`, rebased on latest `stablyai/orca` main (`6f44d18f022`).

This is a **stack candidate**. One PR is easier to demo; upstream would likely prefer splitting it (see Review notes).

## ELI5

Any Orca agent on any connected machine can start, message, read, and stop workers, agents, and terminals on any other connected machine using only the `orca` CLI. Traffic goes through the desktop app you already paired. No SSH between servers, and no pairing secrets copied around. `orca host inventory` is the one command that shows the fleet.

## What Changed

- **`--host <name>`** is a desktop-connected machine from `orca host list` / `orca host inventory`. It reuses the existing pairing channel (`peerFingerprint` / `pairingRevision`). `--on` / `--environment` still mean paired-server federation / execute-there.
- **Remote-to-remote** commands route through the desktop hub. Handles (`term_…`, `ctx_…`) auto-resolve when unique.
- **`orca host inventory`** lists hosts, projects, folders, installed agent CLIs, and live sessions. `--group` filters.
- **Same-named project groups** from different hosts draw as one sidebar header (name-path twins). Dragging a project into that header creates a twin group on the project's machine. Rename and delete apply to every twin. `--group` places agent launch, terminal create, worker-start, and worktree create.
- **First-turn rejection** (for example Codex “model is not supported”) fails worker-start / agent launch with **exit 5**, keeps the dispatch as `failed` / `agent_turn_failed`, and keeps `--json` stdout pure JSON. `worker-show` never reports `dispatch_not_found` for that row. The desktop’s own host name is a valid `--host`.
- Bundled **orca-cli** and **orchestration** skills, CLI help, and docs teach inventory-first, no-SSH routing.

## Why

Agents on a laptop, a Linux box, and a Windows desktop could not drive each other without SSH or copying pairing codes. The fork proved the hub-and-spoke design; this re-implements it on current `--on` / `--environment` / bot-group architecture instead of merging (trial merge ~147 conflicts).

## Linked Issue

Related: #29535, #34812 (cross-host project groups). Remote bot @mentions: #45831 (follow-up; composer still lists paired-server bots, not desktop-hub hosts).

Fixes # <!-- maintainer: attach pre-existing issues; do not open needless ones -->

## Design

Hub-and-spoke:

1. Each execution host CLI talks to its local runtime.
2. `--host <desktop-connected-name>` wraps the runtime client through `orchestration.desktopHub.call`.
3. The desktop forwards over the existing pairing session. Only the volunteer that registered as the hub may `orchestration.desktopHub.answer`.
4. `orchestration.surface.inventory` / `ensureScratch` run **on the target host**. Scratch lives in `~/orca-orchestration` (or `%USERPROFILE%\orca-orchestration`) in an **Orca orchestration** sidebar group, never `$HOME`.

Schema: `SCHEMA_VERSION` **52** adds `blocked_reason` on worker dispatches.

Capabilities: `orchestration.session-placement.v1`, `orchestration.handle-routing.v1`, client `orchestration.desktop-hub.v1`.

## Visual Proof

Plan (record after a two-host smoke):

1. `orca host inventory --json` on the desktop and on a paired execution host (same connected rows).
2. From host A: `orca agent launch --host <B> --agent <id> --prompt "…" --json` → tab appears in the desktop window under B.
3. Sidebar: same-named groups from A and B share one header.
4. Bad `--model`: worker-start / agent launch exit 5 with dispatchId/handle/host; `worker-show` keeps `failed`.
5. `--json` failure: stdout is one JSON object, diagnostics on stderr.

Until those clips exist: **N/A** for landing this draft internally; attach before opening upstream.

## Testing

- [x] Automated tests for hub routing, inventory formatting, first-turn watch, group clustering, `--group` placement, exit codes
- [ ] Manual two-host smoke (macOS desktop + Linux execution host; Windows path/shell still needs a Windows host)
- [x] Tests hardcode expected values and fail if the change is reverted (no copy/i18n/CSS tests)

Commands: `pnpm test <paths> --maxWorkers=2`, `pnpm tc` (includes the bun composite TS6307 check), `pnpm lint`, `pnpm build`, `pnpm check:changed --base=upstream/main`.

Recorded on this branch:

- `pnpm tc` passed (node, web, cli, bot-evals; bun composite included)
- `pnpm check:changed --base=upstream/main`: **46/46**
- `ORCA_CODE_QUALITY_BASE=upstream/main pnpm lint`: **49/49**
- Full `pnpm test --maxWorkers=2`: **5070 passed**, 62 skipped; 6 schema assertions were on v51 (fixed). Remaining isolated failures are in files this branch does not touch (agent-hooks persistence, session-store receipts, GitHub cache flush, Claude folder login, PTY secret-scan matching this VM hostname `cursor`)
- `pnpm build`: desktop/CLI/electron-vite/web + skills-cli verification passed. `build:mobile-web` stopped because `mobile/` deps are not installed in this environment (this branch does not touch `mobile/`)

## Performance

None extra on the hot path, because hub inventory and `--host` wrapping run only when a CLI command names a desktop-connected host or asks for inventory. Sidebar clustering is O(groups) on sidebar rebuild.

## Risk

**Level:** Medium

A wrong hub volunteer, a leaked control-plane method via `desktopHub.call`, or a `--host` / `--on` mix-up could send a command to the wrong machine or fail a previously local start. Forwarded methods are allowlisted (orchestration/agent/terminal/workspace/status only); pairing, accounts, and settings cannot hop. Back-out is a plain revert of this branch; schema v52 is additive (`blocked_reason` nullable). Older paired phones/servers without the new RPCs keep `--on` / `--environment` federation.

## Review

See `REVIEW_NOTES.md` on this branch.

## Agent skill upstream boundary

- [x] Skill-guide and bundled-skill text was written for Orca’s own CLI; it does not copy upstream skill-installer source.

## Recommended split (if upstream wants a stack)

1. Desktop hub volunteer + `orchestration.desktopHub.*` RPCs + CLI `--host` bind + `host inventory`
2. First-turn rejection / exit 5 / dispatch keep
3. Same-name group clustering + `--group` placement
4. Skills, docs, help text

## Follow-up

Remote bot `@` mentions across desktop-connected hosts (#45831): `useBotChatComposerRoom` still lists paired-server bots (`--on`) for local chats, not desktop-hub host names. CLI `--host` covers coordination until then.
