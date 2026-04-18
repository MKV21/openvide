# Implementation notes: permission prompts in OpenVide

Status: draft
Date: 2026-04-18
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

### Main question
Best path is to find whether Codex app-server already surfaces structured approval events.

If yes:
- map those directly in `apps/daemon/src/codexAppServerRunner.ts`
- when approval event arrives:
  - store `session.pendingPermission`
  - set session status to `awaiting_approval`
  - emit normalized stream event `permission_request`

If not:
- temporary fallback: parse specific Codex output patterns in either:
  - `apps/daemon/src/codexAppServerRunner.ts`, or
  - `apps/daemon/src/normalizedParser.ts`
- but only for known structured-looking permission cases
- avoid broad fragile prose parsing if possible

## 3. Add a daemon RPC for user decisions

### In `apps/daemon/src/ipc.ts`
Add method:
- `session.permission.respond`

Input:
```ts
{
  sessionId: string;
  requestId: string;
  decision: "approve_once" | "reject" | "abort_run" | "reply";
  replyText?: string;
}
```

Behavior:
- validate matching pending request
- forward decision to the running Codex session
- clear or update `pendingPermission`
- move session back to `running` or terminal state

### Important
This method should be idempotent.
If the request is already resolved, return a harmless success or a typed already-resolved result.

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

### Patch 1
Backend types and session state
- add `awaiting_approval`
- add `pendingPermission`

### Patch 2
Backend event emission
- Codex runner emits `permission_request`
- daemon stores pending request

### Patch 3
Backend response path
- add `session.permission.respond`
- resume/abort/reject logic

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

1. Codex app-server may not expose approval callbacks cleanly.
2. CLI parsing may be needed as a bridge and could be brittle.
3. G2 message model is currently simpler than the main app and may need quick extension.
4. Reconnect/state replay can get messy if pending approval lives only in transient stream events.

## Strong recommendation

Do not start with a giant cross-tool abstraction.

Start with:
- one pending request per session
- one tool (Codex)
- one request kind (command)
- three decisions (approve once / reject / abort)

That is enough to validate the whole loop without building a cathedral for hypothetical future agents.
