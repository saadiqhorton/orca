# Cook harness (vendored)

`BRIEF.md` and `GAPS-r01.md` are the Cook source. `run_scenario.py` launches a **fresh** Claude/Codex with the scenario text as the only prompt, or a scripted orca-CLI path.

This skill’s default drive is the in-process desktop-hub e2e (no SSH). Use `run_scenario.py` on a live desktop when `orca host inventory --json` works and `claude` or `codex` is on `PATH` (`ORCA_VERIFY_LIVE=1`).

Do not use `rig.sh` from the Cook box as the agent-under-test path: that script SSHes as the **operator** to copy files onto namespaced hosts. Agents under test must never ssh.
