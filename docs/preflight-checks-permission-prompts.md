# Preflight checks: permission prompts in OpenVide

Status: draft
Date: 2026-04-18
Last updated: 2026-04-19
Related:
- `docs/spec-permission-prompts.md`
- `docs/implementation-notes-permission-prompts.md`

## Goal

Before implementing interactive permission prompts, verify the exact runtime behavior and integration constraints so we do not build the wrong abstraction.

## Why this exists

The big risk is building a pretty UI flow for a backend that cannot actually pause, emit structured permission requests, or resume cleanly. This file is the reality check before code surgery.

## Current preflight result

Local preflight changed the preferred V1 path:
- Codex app-server generated bindings show structured approval support.
- `thread/start` and `turn/start` support `approvalPolicy`.
- supported policies include `on-request`, `on-failure`, `untrusted`,
  granular policy config, and `never`.
- app-server can initiate command/file/permission approval requests and expects
  JSON-RPC responses.

OpenVide currently does not use that path:
- CLI Codex is started with `--full-auto`.
- app-server Codex is started with `approvalPolicy: "never"`.
- session creation paths frequently set `autoAccept: true`.
- the app-server runner currently ignores unknown `id` messages, which is a
  problem because server-initiated requests also carry an `id`.

Server preflight is still required because the target server may have a
different Codex version, config, user, PATH, or workspace permissions.

## Server preflight result

Observed on the target server:
- `codex exec --sandbox workspace-write ...` failed in `/home/mike/repos/test`
  with `Not inside a trusted directory and --skip-git-repo-check was not
  specified.`
- Re-running with `--skip-git-repo-check` succeeded and created the requested
  test file.

Interpretation:
- the server user and workspace can execute Codex with `workspace-write`
- the first failure was the Codex trust/repo guard, not a filesystem write
  permission failure
- OpenVide's CLI path already passes `--skip-git-repo-check`, so remaining
  permission/approval failures should be treated as OpenVide runtime behavior
  unless app-server-specific server diagnostics show otherwise

Current OpenVide behavior observed with the existing implementation:
- writing a file in the current workspace works
- writing a file under `/tmp` also works on this server
- running `curl -s https://example.com > openvide-curl-test.txt` does not work
- no first-class permission prompt is surfaced for the network case

Interpretation:
- `/tmp` is not a reliable approval trigger on this deployment
- network access is the current clean reproducer for missing Ask-mode behavior
- the first backend proof should use a network command or another action that
  the sandbox blocks under current Auto mode

## Preflight checklist

## 1. Codex app-server approval capability

### Question
Can Codex app-server emit structured approval or permission-request events?

### Current answer
Yes on the local machine used for this preflight.

Generated Codex app-server TypeScript bindings include:
- `AskForApproval`
- `ApprovalsReviewer`
- `CommandExecutionRequestApprovalParams`
- `CommandExecutionRequestApprovalResponse`
- `FileChangeRequestApprovalParams`
- `PermissionsRequestApprovalParams`
- legacy `ExecCommandApprovalParams`

### What to verify
- whether the server deployment exposes the same generated schema
- whether `thread/start` with `approvalPolicy: "on-request"` works there
- whether a command that needs approval emits a server-initiated request
- whether answering that request resumes the turn

### Why it matters
If app-server already supports this, we should use it directly.
If not, V1 may need either:
- CLI fallback for Ask mode, or
- a temporary parser-based bridge.

## 2. Decision return path

### Question
How does a user decision get sent back to Codex?

### Current answer
For app-server Ask mode, the daemon should answer the original server-initiated
JSON-RPC request id.

For command approval, decision mapping should start as:
- approve once -> `accept`
- reject -> `decline`
- abort run -> `cancel`

### What to verify
- dedicated RPC method for approve/reject
- resuming the turn with a follow-up message
- interrupt + restart semantics
- whether request IDs exist or need to be synthesized by OpenVide

### Why it matters
Without a clean resume path, the whole approval UX becomes fake.

## 3. Single vs multiple pending requests

### Question
Can one session produce multiple simultaneous approval requests?

### What to verify
- whether requests are strictly sequential
- whether nested or parallel requests can occur
- whether one turn can emit a second request before the first is answered

### Why it matters
V1 should strongly prefer exactly one pending request per session. If the runtime can stack several, the data model needs to account for that early.

## 4. CLI parity with app-server

### Question
Do Codex CLI and Codex app-server expose similar approval semantics?

### Current answer
CLI parity is no longer the preferred first path.

The local `codex exec --help` exposes `--full-auto`, `--sandbox`, and
`--dangerously-bypass-approvals-and-sandbox`, but not a daemon-friendly
interactive approval protocol. OpenVide also closes stdin for CLI runs, so
plain terminal prompts cannot be mediated by the current daemon.

### What to verify
- CLI behavior when permission approval is needed
- whether CLI can run in a true ask/interactive mode in a way the daemon can mediate
- whether emitted messages/JSON contain structured approval info or only prose

### Why it matters
If app-server lacks approval support but CLI has it, Ask mode may need to force CLI for Codex.

## 5. Session persistence and reconnect behavior

### Question
What survives reconnect or app restart while approval is pending?

### What to verify
- whether the pending state exists only in stream events
- whether daemon session state can persist it safely
- whether reconnect/replay can reconstruct the pending prompt without ambiguity

### Why it matters
Phone and glasses clients will disconnect or switch surfaces. Pending approval must not disappear into the void.

## 6. Stream protocol extension feasibility

### Question
How easy is it to add a new normalized event type like `permission_request`?

### What to verify
- where normalized stream events are defined and mapped
- whether unknown event types already pass through safely
- whether both app and G2 can consume a new event without breaking existing chat rendering

### Why it matters
If the stream layer is brittle, implementation order must start with protocol plumbing.

## 7. App UI integration constraints

### Question
Can the main app render an action card inside the current message architecture without major rewrites?

### What to verify
- whether `AiContentBlock` can be extended safely
- where interactive block components already exist
- how action callbacks from a rendered card reach the transport layer

### Why it matters
Main app should be the easiest surface. If it is already painful, G2 will be worse.

## 8. G2 message model constraints

### Question
Can G2 support a permission card without a large refactor?

### What to verify
- whether current `ChatMessage` shape can carry structured permission data
- whether adding a compact card component is enough
- whether G2 needs a mini block-model first

### Why it matters
If G2 needs a deep chat-model rewrite, that should be split from the approval backend work.

## 9. Glasses interaction constraints

### Question
What is the minimum actionable UI that works on Even Realities glasses?

### What to verify
- max practical button count on one screen
- whether there is a reliable `More` / secondary screen pattern
- whether text reply is realistic on glasses in V1

### Why it matters
The glasses UI should not dictate the entire architecture, but it should influence the data shape and interaction design early.

## 10. Safe fallback behavior

### Question
What should happen when Ask mode is selected but the backend cannot support an approval request cleanly?

### What to verify
- fail with explicit user-facing message
- silently downgrade to auto mode
- refuse session start until mode is changed

### Recommendation
Do **not** silently downgrade from Ask to Auto.
If Ask mode is unsupported for a given backend path, show a clear message.

Recommended V1 fallback:
- if Ask mode is requested and app-server approval cannot be enabled, fail the
  session start/send with an explicit error
- do not switch to `--full-auto`
- do not switch to `approvalPolicy: "never"`

## Server commands to run before patching

Run these on the target server as the same user that starts
`openvide-daemon`:

```bash
whoami
which codex
codex --version
codex exec --help
codex app-server --help
```

Then test basic workspace permissions from the intended working directory:

```bash
pwd
ls -ld .
codex exec --sandbox workspace-write "Create a file named openvide-codex-permission-test.txt in the current directory, then stop."
```

If that fails directly in the terminal, fix server user/workspace/Codex config
first. If it succeeds directly but fails through OpenVide, patch OpenVide.

## Server commands to run after backend patch

Use the same workspace that reproduced the missing network approval behavior.

Create an Ask-mode Codex session:

```bash
openvide-daemon session create \
  --tool codex \
  --cwd /home/mike/repos/test \
  --permission-mode ask
```

Send a prompt that should need network permission under workspace-write
sandboxing:

```bash
openvide-daemon session send \
  --id <session-id> \
  --prompt 'Run curl -s https://example.com > openvide-curl-test.txt and then stop.'
```

Watch the stream until a `permission_request` event appears:

```bash
openvide-daemon session stream --id <session-id> --follow
```

Fetch session state if needed:

```bash
openvide-daemon session get --id <session-id>
```

The session should show:
- `status: "awaiting_approval"`
- `pendingPermission.status: "pending"`
- `pendingPermission.requestId`
- a command or network permission description

Approve once:

```bash
openvide-daemon session permission \
  --id <session-id> \
  --request-id '<pendingPermission.requestId>' \
  --decision approve_once
```

Alternative reject path:

```bash
openvide-daemon session permission \
  --id <session-id> \
  --request-id '<pendingPermission.requestId>' \
  --decision reject
```

Alternative abort path:

```bash
openvide-daemon session permission \
  --id <session-id> \
  --request-id '<pendingPermission.requestId>' \
  --decision abort_run
```

Expected result:
- approve once sends the matching JSON-RPC response back to Codex app-server
  and the turn continues
- reject maps to the app-server decline decision
- abort maps to cancel and interrupts the turn
- Ask mode must not silently fall back to `--full-auto`

## Recommended decision gates

## Gate A: backend capability
Proceed only after this is true:
- the target server's Codex app-server supports structured approval requests
  and OpenVide can answer one.

Fallback gate:
- if app-server Ask mode is unavailable on the target server, only then
  evaluate whether Codex CLI can be mediated well enough for V1 Ask mode.

## Gate B: persistence
Proceed only if pending approval can be stored in daemon session state and replayed on reconnect.

## Gate C: UI feasibility
Proceed only if:
- main app can render a card with actions easily
- G2 can carry a minimal structured permission payload without a total chat rewrite

## Red flags

Stop and rethink if any of these are true:
- approval state exists only as raw prose text
- there is no reliable resume path after user decision
- multiple pending requests are common and unordered
- G2 cannot safely represent the approval state without tearing up the whole chat model

## Best-case outcome

After preflight, we know one of these is the right V1 path:

### Path 1, ideal
Codex app-server has structured approval hooks and the server deployment
matches local behavior.

### Path 2, acceptable
Codex CLI is the only viable Ask-mode backend for now.

### Path 3, temporary bridge
We ship a narrow parser-based Codex V1 while keeping the protocol normalized above it.

## Suggested execution order

1. Verify the server Codex version and app-server schema.
2. Prove one app-server approval request can be received and answered.
3. Choose backend path for Ask mode.
4. Confirm persistence strategy.
5. Confirm app and G2 rendering feasibility.
6. Start implementation.

## Bottom line

Do not start by coding the UI.
Start by proving the backend can:
- pause,
- ask,
- wait,
- resume.

If that loop is real, the rest is just engineering. If not, the prettiest permission card in the world is decorative nonsense.
