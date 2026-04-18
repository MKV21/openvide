# Preflight checks: permission prompts in OpenVide

Status: draft
Date: 2026-04-18
Related:
- `docs/spec-permission-prompts.md`
- `docs/implementation-notes-permission-prompts.md`

## Goal

Before implementing interactive permission prompts, verify the exact runtime behavior and integration constraints so we do not build the wrong abstraction.

## Why this exists

The big risk is building a pretty UI flow for a backend that cannot actually pause, emit structured permission requests, or resume cleanly. This file is the reality check before code surgery.

## Preflight checklist

## 1. Codex app-server approval capability

### Question
Can Codex app-server emit structured approval or permission-request events?

### What to verify
- whether `thread/start` supports approval modes other than `"never"`
- whether `turn/start` can yield a structured event like:
  - permission request
  - confirmation needed
  - command approval required
- whether there is an official method to continue after approval

### Why it matters
If app-server already supports this, we should use it directly.
If not, V1 may need either:
- CLI fallback for Ask mode, or
- a temporary parser-based bridge.

## 2. Decision return path

### Question
How does a user decision get sent back to Codex?

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

## Recommended decision gates

## Gate A: backend capability
Proceed only after one of these is true:
- Codex app-server supports structured approval events, or
- Codex CLI can be mediated well enough for V1 Ask mode.

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
Codex app-server has structured approval hooks.

### Path 2, acceptable
Codex CLI is the only viable Ask-mode backend for now.

### Path 3, temporary bridge
We ship a narrow parser-based Codex V1 while keeping the protocol normalized above it.

## Suggested execution order

1. Inspect Codex app-server approval capabilities.
2. Inspect Codex CLI approval behavior.
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
