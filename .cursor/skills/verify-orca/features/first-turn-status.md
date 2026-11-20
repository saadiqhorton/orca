# First-turn status

A fatal first turn (`model_not_found` 400) is not a successful launch. `agent launch` / `worker-start` must exit non-zero with `agent_blocked_on_prompt` and `blocked_reason agent_turn_failed:model_not_found`. Inventory omits `agentIdentity` after the agent exits. Before launch, compare `--model` with the target's `codex --version` (`gpt-6-sol` / `gpt-6-luna` need 0.156.0+).

## Sub-features

- `R14` first-turn watch on agent launch.
- CLI `assertAgentLaunchPromptDelivered` treats that blocked reason as exit 5.
- Unknown model ids are refused; spoken names map (`gpt 6 luna` → `gpt-6-luna`).

## How to get to it (user POV)

- `orca agent launch --host clawd --agent codex --model gpt-6-luna --prompt "…"`
- On Codex 0.154.0 this must fail, not print success with `agentStatus: working`.

## Driving it with verify-orca

Preconditions:

- Doctor ready.

- **Unit.** `agent-launch-first-turn.test.ts`, `agent-launch-first-turn-watch.test.ts`, `codex-model-version-gate.test.ts`, `agent-launch-request.test.ts`.
- **Proof.** `scenarios/R14.json`.

## Gotchas

- Prompt delivery is not success. Watch the first screen.
- Copy handles exactly; do not invent model ids the user did not name.
