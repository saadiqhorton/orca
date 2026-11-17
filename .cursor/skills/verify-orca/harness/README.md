# Cook harness (vendored)

`BRIEF.md` and `GAPS-r01.md` are the Cook source. `run_scenario.py` launches a **fresh** Claude/Codex with the scenario text as the only prompt, or a scripted orca-CLI path.

verify-orca Drive **always** uses this harness (scripted CLI) against a live desktop + 2 hosts when inventory works. `ORCA_VERIFY_LIVE=1` must invoke it, not write a note. Without a live two-host desktop (or the operator box rig), S01–S08 fail.

Do not use `rig.sh` from the Cook box as the **agent-under-test** path: that script SSHes as the **operator** to copy files onto namespaced hosts. Agents under test must never ssh. verify-orca may use the operator box-rig path itself when `/workspace/xhost-real-test` is present.
