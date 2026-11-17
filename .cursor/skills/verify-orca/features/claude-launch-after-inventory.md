# Claude launch after inventory

After the desktop has served a host list (which installs host-instruction files), Claude `worker-start` and `agent launch` must still start. Orca-owned `--append-system-prompt-file` is not a user extra-arg and must not hit the extras allowlist.

## Sub-features

- `R07` Claude launch after a host list has been served, including `worker-start --agent claude` and `agent launch --agent claude` (local and `--host`).
- `owned-argv` `orcaOwnedAgentArgs` / `mergeOrcaOwnedAgentArgs` bypass `parseExtraAgentArgs`.
- `user-extras` `--append-system-prompt-file` stays forbidden in saved user extras.

## How to get to it (user POV)

- `orca host inventory --json`
- Then `orca orchestration worker-start --agent claude --spec hostname`
- Then `orca agent launch --agent claude --prompt hostname` and the same with `--host ubuntu-server-local`

## Driving it with verify-orca

Preconditions:

- Doctor ready (including bun/vitest). Inventory has been served at least once.

- **Fresh / live.** After inventory, the real CLI commands above. Fail on `isn't allowed in extra arguments` or `agent_session_operation_unknown`.
- **Unit.** `orca-owned-claude-launch-args.test.ts` calls real `parseExtraAgentArgs`, `resolveAgentStartupPlanInputs`, and `buildAgentStartupPlan`.
- **Proof.** `scenarios/R07.json`. A grep for the flag in source is not enough.

## Gotchas

- Injecting the flag through `extraAgentArgs` is the 1ff11f1b bug. Keep it on `orcaOwnedAgentArgs`.
- The Claude binary does not need to exist for the allowlist failure to show up; validation runs before spawn.
