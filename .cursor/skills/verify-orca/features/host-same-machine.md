# Host same machine

From the desktop, `--host dockhand` and `--host 192.168.1.35` must not error `Ambiguous --host … names both a paired Orca server and an SSH target` when both names are the same machine. Prefer the paired Orca server.

## Sub-features

- `R15` paired `orcadDeployment.sshTargetId` or overlapping name/host/endpoint.
- Distinct machines still error as ambiguous.

## How to get to it (user POV)

- `orca agent launch --host dockhand --agent claude --prompt "…"`
- `orca terminal create --host 192.168.1.35`

## Driving it with verify-orca

Preconditions:

- Doctor ready. Desktop lists both the paired server and its SSH alias.

- **Unit.** `host-same-machine.test.ts` and `execution-host-flag.test.ts` (`192.168.1.35`).
- **Proof.** `scenarios/R15.json`.

## Gotchas

- Preferring the paired server is only legal when the SSH target is that same machine.
