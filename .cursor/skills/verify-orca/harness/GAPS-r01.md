# Gap list for the cloud agent (after r00 baseline + r01 on 883313df) — Nov 17, 2026 12:06 ET

Evidence: harness/results/r00/{rig,real}/, harness/results/r01/rig/, critic bundles harness/critic-inputs/r00, r01.

## 1. Fresh agents don't know Orca can reach other machines (BLOCKER for "it should just know")
Measured on real hardware (fresh codex in an Orca terminal on dockhand, prompt only):
- S06 "What machines and agents can you use right now?" → "I'm the only agent… haven't verified access to any other machine." 0 orca commands.
- S02 "Open a terminal on ubuntu-server-local and run uptime" → `ssh ubuntu-server-local uptime` (fails), then asks the user for an IP. 0 orca commands.
- S01 "Start a Claude agent on ubuntu-server-local…" → PASS, but only because "agent" matched the orchestration skill description.
Cause: the discovery stubs Orca installs (~/.agents/skills/orchestration/SKILL.md, orca-cli/SKILL.md) never mention other machines, hosts, servers, or remote terminals. Fixes (do all three):
  a. Skill descriptions: add triggers like "another machine/host/server, a named host (e.g. ubuntu-server-local), 'on <host>', 'open a terminal on', 'run X on', 'what machines/hosts can you use', anything ssh-like → use `orca host inventory` first, never ssh."
  b. Inject a short Orca preamble for agents Orca launches: AGENTS.md/CLAUDE.md fragment, codex `developer_instructions`, or `--append-system-prompt`. Content: "You run inside Orca. Connected machines: <names>. For any work on another machine use `orca … --host <name>`; never ssh. Start with `orca host inventory --json`." Keep it under ~6 lines.
  c. Optionally export `ORCA_HOSTS=<comma list>` into Orca terminals, so `env` reveals it.
Acceptance: fresh codex and claude pass real S02 and S06 with no hint, ≤3 orca commands, no ssh.

## 2. Unknown --host runs locally (SAFETY) — S08, still in 883313df
`orca agent launch --host TEMPLEOFDOOM --agent claude --prompt hello` → exit 0, launched on the caller's host.
Root cause: `bindDesktopHubHost()` (src/cli/hosts/desktop-hub-command-route.ts) returns the original client when `matchDesktopHubHost` finds no row. It also returns null on any hub-list error, so a disconnected hub falls back to local. Commands that don't consume `--host` themselves then drop it.
Fix: when the hub list succeeds with no match and the name is not an SSH target or environment (reuse execution-host-flag resolution), throw `unknownDesktopHubHost(name)` with the connected names and the corrected command. When the hub list call fails, throw `desktop_hub_unavailable`, never run locally. Add tests for `agent launch`, `terminal create/list/send`, and `worker-start`.

## 3. 883313df does not compile
TS2345 ×3 in src/cli/terminals/terminal-send-startup-dialog.ts. Fix: `isStartupSecurityDialogReason(reason: string | undefined): reason is string` in src/shared/agent-launch/startup/agent-launch-blocked-prompt.ts (patch: /workspace/orch-build/883-typefix.patch). Run `pnpm typecheck:cli` before every push.

## 4. Remote scratch tabs are headless
Workers/terminals created with `--host` in ~/orca-orchestration (folder: workspaces) get group `headless-terminals:folder:<id>`. Seen in real S01 (worker on ubuntu-server-local) and rig S07. Make `--host` surfaces visible tabs under the host's "Orca orchestration" project by default (the guide promises this).

## 5. Smaller
- `worktree create --host --agent` also opens an extra plain shell tab next to the agent tab.
- worker-read terminal fallback returns the oldest scrollback; return the newest.
- worker-list shows host=local and liveness=unverifiable for remote workers (5ec17f0a claims a fix; re-check).
- `terminal create` warns "could not make it discoverable".
