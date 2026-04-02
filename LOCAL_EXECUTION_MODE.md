# Local Execution Mode

This repository should follow the shared governance pack from `HenrikFaul/governance`.

Canonical execution-governance references:
- `agent_execution_rules.md`
- `no_permission_loop.md`
- `connector_write_minimization.md`

Repository expectation:
- do not open extra chat-level permission loops for GitHub, changelog, governance, or documentation updates when the user request already implies execution
- continue after tool-level confirmation dialogs without asking the same permission again in chat
- minimize confirmation count by batching writes where possible
