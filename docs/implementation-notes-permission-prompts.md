# Implementation notes: permission prompts in OpenVide

Status: backend patch in progress
Date: 2026-04-18
Last updated: 2026-04-19
Related: `docs/spec-permission-prompts.md`

## Goal

Translate the full spec into a minimal first implementation plan with concrete file touch points.

## Recommended V1 scope

Implement only:
- Codex first
- command permission prompts first
- app + G2 web support first
- glasses-safe rendering via G2 after web card exists

Do not implement yet:
- approve always
- file diff approvals
- policy engine
- scheduled/team-run approvals
- multi-request queues

## Updated implementation finding

Local Codex app-server bindings show that Codex already has structured approval
requests. Therefore V1 should not begin with CLI output parsing.

Use Codex app-server first:
- set Ask mode through `thread/start` or `turn/start`
- receive server-initiated approval requests
- persist one pending request on the daemon session
- answer the original app-server JSON-RPC request when the user decides

The biggest current backend gap is in `apps/daemon/src/codexAppServerRunner.ts`:
- messages with an `id` are treated as responses to daemon-initiated requests
- if the `id` is not in the local `pending` map, the message is ignored
- server-initiated app-server requests also have an `id`
- approval request handling must distinguish JSON-RPC responses from
  JSON-RPC requests

## Backend checkpoint 2026-04-19

Implemented in the current patch:
- daemon session model has `permissionMode: "auto" | "ask"`
- daemon session status has `awaiting_approval`
- daemon session state can persist one `pendingPermission`
- `permissionMode: "ask"` forces Codex to use app-server instead of CLI
- Ask mode starts Codex app-server with `approvalPolicy: "on-request"`,
  `approvalsReviewer: "user"`, and explicit workspace-write sandbox settings
- Auto mode keeps the current behavior:
  - Codex CLI still uses `--full-auto`
  - Codex app-server still uses `approvalPolicy: "never"`
- `codexAppServerRunner` distinguishes app-server JSON-RPC responses from
  server-initiated requests
- app-server approval requests are normalized into `permission_request` output
  events and stored as `session.pendingPermission`
- daemon exposes `session.permission.respond`
- CLI exposes:
  - `openvide-daemon session create --permission-mode ask`
  - `openvide-daemon session permission --id <id> --request-id <id> --decision <approve_once|reject|abort_run>`
- Ask mode refuses the previous CLI auto-fallback if app-server cannot attach

Still not implemented:
- main app approval card
- G2 web approval card
- glasses-specific approval screen
- approve-for-session / policy amendments
- multi-request queue

## Current relevant files

### Daemon / backend
- `apps/daemon/src/types.ts`
- `apps/daemon/src/sessionManager.ts`
- `apps/daemon/src/codexAppServerRunner.ts`
- `apps/daemon/src/normalizedParser.ts`
- `apps/daemon/src/bridgeServer.ts`
- `apps/daemon/src/ipc.ts`

### App client
- `apps/app/src/core/types.ts`
- `apps/app/src/core/ai/CodexAppServerTransport.ts`
- `apps/app/src/core/ai/adapters/codexAdapter.ts`
- `apps/app/src/components/CommandExecutionCard.tsx`
- likely a new component, e.g. `apps/app/src/components/PermissionRequestCard.tsx`

### G2 client
- `apps/g2/src/types/index.ts`
- `apps/g2/src/screens/chat.tsx`
- likely a new component, e.g. `apps/g2/src/components/permission-card.tsx`
- if glasses-specific rendering diverges: `apps/g2/src/glass/screens/live-output.ts`

## Minimal architecture

## 0. Prove the Codex app-server request loop

Before UI work, add or run a narrow daemon/backend spike that proves:
- OpenVide starts a Codex app-server thread with approval enabled.
- Codex emits a server-initiated approval request for a blocked command.
- OpenVide captures the request and stores it as pending session state.
- OpenVide answers the exact request id with approve/reject/cancel.
- Codex resumes or stops according to the decision.

Do not build app or glasses cards until this loop works in the daemon.

## 1. Add a daemon-native pending permission model

### In `apps/daemon/src/types.ts`
Add:
- session status `awaiting_approval`
- `PendingPermissionRequest` interface
- `pendingPermission?: PendingPermissionRequest` on session state

Suggested shape:
```ts
interface PendingPermissionRequest {
  requestId: string;
  kind: "command" | "generic";
  title: string;
  description?: string;
  command?: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
}
```

Keep V1 narrow. Do not over-model file/network variants yet.

## 2. Teach Codex runner to emit structured permission requests

### In `apps/daemon/src/codexAppServerRunner.ts`
Map Codex app-server approval requests directly.

Known request methods from generated local bindings:
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `execCommandApproval`
- `applyPatchApproval`

V1 should implement command approval first:
- normalize `item/commandExecution/requestApproval`
- optionally normalize legacy `execCommandApproval`
- store one pending permission request on the session
- set session status to `awaiting_approval`
- emit a normalized `permission_request` output event

Do not parse broad prose from stdout/stderr for V1 unless server diagnostics
prove that app-server approval requests are unavailable on the deployment.

### Required JSON-RPC handling change
The app-server line handler must distinguish:
- response to a daemon-initiated request: has `id`, no `method`, matches
  `pending`
- server-initiated request: has `id`, `method`, and `params`
- notification: has `method` and `params`, no request `id`

The second case is missing today and is the core unlock for Ask mode.

### Starting Ask-mode Codex turns
When `permissionMode === "ask"`:
- new `thread/start` should include `approvalPolicy: "on-request"` or the
  selected granular equivalent
- use `approvalsReviewer: "user"`
- set an explicit sandbox policy

When `permissionMode === "auto"`:
- keep current behavior for now:
  - CLI uses `--full-auto`
  - app-server uses `approvalPolicy: "never"`

## 3. Add a daemon RPC for user decisions

### In `apps/daemon/src/ipc.ts`
Add method:
- `session.permission.respond`

Input:
```ts
{
  id: string; // `sessionId` is also acceptable for callers that use that name
  requestId: string;
  decision: "approve_once" | "reject" | "abort_run";
}
```

Behavior:
- validate matching pending request
- answer the original pending Codex app-server JSON-RPC request
- clear or update `pendingPermission`
- move session back to `running` or terminal state

### Important
This method should be idempotent.
If the request is already resolved, return a harmless success or a typed already-resolved result.

Suggested decision mapping for command approval:
- `approve_once` -> `accept`
- `reject` -> `decline`
- `abort_run` -> `cancel`

Later:
- session-scoped approvals can map to `acceptForSession`
- policy amendments can map to the app-server amendment decision shapes
- text `reply` should be added with the general clarification-input flow, not
  mixed into the first Codex permission-response path

## 4. Extend app-side message model

### In `apps/app/src/core/types.ts`
Add new content block type:
- `permission_request`

Add optional fields:
- `permissionRequestId`
- `permissionKind`
- `permissionStatus`
- `permissionTitle`
- `permissionDescription`
- `permissionCommand`
- `permissionOptions`

This lets app rendering stay tool-agnostic.

## 5. Render a dedicated card in the app

### New component
Create:
- `apps/app/src/components/PermissionRequestCard.tsx`

It should show:
- title
- short description
- exact command
- buttons:
  - Approve once
  - Reject
  - Abort run

For V1, command approval only.

### Reuse pattern
Style it similar to `CommandExecutionCard`, but action-oriented.

## 6. Wire app actions back to daemon

Likely touch points:
- `apps/app/src/core/ai/CodexAppServerTransport.ts`
- whichever store/action layer dispatches session UI events

Need helper:
- `respondToPermissionRequest(sessionId, requestId, decision, replyText?)`

When user taps action:
- optimistic disable buttons
- call daemon RPC
- update block status from pending to approved/rejected/cancelled

## 7. Extend G2 message model and chat renderer

### In `apps/g2/src/types/index.ts`
Current `ChatMessage` is too simple for this. V1 options:

### Option A, fast but slightly ugly
Embed permission prompts as a special structured message shape in `ChatMessage`.

### Option B, cleaner
Evolve G2 toward block-based rendering similar to main app.

Recommendation for speed:
- do Option A first for V1
- add optional field:
```ts
permissionRequest?: {
  requestId: string;
  title: string;
  description?: string;
  command?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
}
```

### In `apps/g2/src/screens/chat.tsx`
Add rendering branch for permission messages with compact buttons.

Buttons:
- Approve
- Reject
- More

Where `More` can expose:
- full command text
- Abort run

## 8. Glasses-safe rendering

If G2 web and glasses share enough rendering, reuse the same permission card.
If not, create a glasses-specific compact card in:
- `apps/g2/src/glass/screens/live-output.ts`

Rules:
- no wall of text
- max 2 to 4 actions
- first screen must be readable in one glance
- command can be truncated with a details drill-down

## 9. Session status handling

Wherever session state is mapped to UI, treat `awaiting_approval` distinctly.

Desired behavior:
- main app: show paused state with pending approval card
- G2: show "Waiting for approval" rather than generic waiting
- glasses: show a clear blocked state, not a silent idle spinner

## 10. Replay on reconnect

The daemon must persist the pending request on the session object.
That way reconnecting clients can re-render the outstanding approval card.

Implementation idea:
- store pending request in session state
- include it in session details fetch / stream snapshot
- on reconnect, UI rehydrates the card from session state

## Minimal patch order

### Patch 0
Backend proof only
- add temporary instrumentation or a narrow test path for Codex app-server
  approval requests
- confirm a real request can be received and answered
- do not touch UI yet

Current status: implemented as the daemon Ask-mode path, still needs target
server validation.

### Patch 1
Backend types and session state
- add `awaiting_approval`
- add `pendingPermission`

Current status: implemented.

### Patch 2
Backend event emission
- Codex app-server runner handles server-initiated JSON-RPC approval requests
- Codex runner emits normalized `permission_request`
- daemon stores pending request

Current status: implemented for Codex app-server request methods:
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `execCommandApproval`
- `applyPatchApproval`

### Patch 3
Backend response path
- add `session.permission.respond`
- JSON-RPC response back to Codex app-server
- resume/abort/reject logic

Current status: implemented with CLI access for manual testing.

### Patch 4
Main app UI
- block type
- `PermissionRequestCard`
- wire buttons to daemon RPC

### Patch 5
G2 web UI
- compact permission card
- action handlers

### Patch 6
Glasses refinement
- shorten labels
- details drill-down
- better blocked-state text

## Likely technical risks

1. Server deployment may run a different Codex version/schema than local dev.
2. The app-server request must stay pending while the UI decision is outstanding;
   timeouts must not accidentally reject it too early.
3. CLI parsing may still be needed as a bridge if app-server Ask mode fails on
   the target host.
4. G2 message model is currently simpler than the main app and may need quick extension.
5. Reconnect/state replay can get messy if pending approval lives only in transient stream events.

## Strong recommendation

Do not start with a giant cross-tool abstraction.

Start with:
- one pending request per session
- one tool (Codex)
- one request kind (command)
- three decisions (approve once / reject / abort)

That is enough to validate the whole loop without building a cathedral for hypothetical future agents.
