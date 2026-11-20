# Stop recovery

`worker-stop` must not die with `folder_workspace_not_found` when the folder catalog row is gone. Fall back to the recorded terminal handle and host and stop by PTY. Settle the dispatch when the stop is confirmed, or when the capability is revoked and the terminal is gone. `worker-start` on a task whose only dispatch is `stop_unknown` offers `--retry-of <dispatch>`.

## Sub-features

- `R13` missing-folder stop settles instead of `stop_unknown` forever.
- `getHostId` uses the unique session partition that still holds the tab.
- `--retry-of` is accepted for `stop_unknown` while the task is still `dispatched`.

## How to get to it (user POV)

- `orca orchestration worker-stop --dispatch <id>` after the scratch folder record vanished.
- If the receipt is `stop_unknown`, `orca orchestration worker-start --task <task> --retry-of <dispatch> …`.

## Driving it with verify-orca

Preconditions:

- Doctor ready.

- **Unit.** `worker-stop-missing-folder.test.ts`; `task-start-claim.ts` stop_unknown retry hint.
- **Proof.** `scenarios/R13.json`.

## Gotchas

- Leaving the dispatch `dispatched` after a failed stop refuses later starts without `--retry-of`.
