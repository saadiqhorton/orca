# Remote terminal

A user can open a terminal on a named connected host and run a command there (`uptime`) without SSH or asking for an IP.

## Sub-features

- `S02` “Open a terminal on ubuntu-server-local and run uptime, tell me the result.”
- `remote-create` uses `orca terminal create --host ubuntu-server-local` (or equivalent after inventory).
- `visible-uptime` returns load-average / uptime text from that host.

## How to get to it (user POV)

- Ask: `Open a terminal on ubuntu-server-local and run uptime, tell me the result.`
- After inventory: `orca terminal create --host ubuntu-server-local`, `terminal send`, `terminal read`.

## Driving it with verify-orca

Preconditions:

- Doctor ready. Target name `ubuntu-server-local` is connected.
- Prompt is exactly `S02.text`. No IP, no `ssh`.

- **Fresh agent.** `./.cursor/skills/verify-orca/scripts/verify-orca run --scenarios S02`. Commands include `orca` with `--host ubuntu-server-local`. Final answer matches `load average` or `up … min/day`.
- **Stand-in.** Same helper. Expect `shouldWrapDesktopHubHost(['terminal','create'])` and skill triggers for “open a terminal on”. Live uptime text is unverified without a live CLI — report that skip; do not call it a live pass.
- **Proof.** `scenarios/S02.json`: `bar.no_ssh`, `bar.zero_wrong_host`, `metrics.ssh_used` empty.

## Gotchas

- r00 real Codex ran `ssh ubuntu-server-local uptime` and asked for an IP. That failure is also R01.
- `terminal list --host` must not silently list the caller when the hub is down (must be `desktop_hub_unavailable`).
