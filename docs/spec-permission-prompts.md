# Spec: Interactive permission prompts for agent actions in OpenVide and G2

Status: draft
Date: 2026-04-18
Last updated: 2026-04-19
Owner: MKV21 fork draft

Implementation note 2026-04-19:
- The backend Ask-mode slice is now represented in daemon code.
- UI surfaces are still pending.
- Auto mode remains the default-compatible path.

## Goal

When an agent run needs user approval for a command, file write, network action, or other privileged step, OpenVide should pause and ask the user what to do instead of failing silently or auto-denying.

This must work in:
- the main OpenVide app
- OpenVide G2 web client
- the Even Realities G2 glasses UI, via the G2 client

## Why this is needed

Current OpenVide behavior is largely non-interactive:
- Claude runs with `--dangerously-skip-permissions`
- Codex CLI runs with `--full-auto`
- Codex app-server starts threads with `approvalPolicy: "never"`
- Gemini runs with `-y`

Current repo evidence:
- `apps/daemon/src/commandBuilder.ts` builds Codex CLI commands with
  `codex exec --json --full-auto --skip-git-repo-check`.
- `apps/daemon/src/codexAppServerRunner.ts` starts new Codex app-server
  threads with `approvalPolicy: "never"`.
- `apps/g2` creates sessions with `autoAccept: true` in multiple flows.
- The CLI runner closes stdin after spawning the process, so plain interactive
  terminal prompts cannot be answered through the current daemon process.

Confirmed local Codex app-server capability:
- generated app-server TypeScript bindings include `approvalPolicy` on
  `thread/start` and `turn/start`
- supported approval policies include `untrusted`, `on-failure`,
  `on-request`, granular approval config, and `never`
- server-initiated approval requests exist for command execution, file
  changes, permission requests, patch approval, and exec approval
- those server requests carry an `id`, `method`, and `params`; the client must
  answer with a matching JSON-RPC response

So today there is no first-class product flow for:
- agent asks for permission
- app surfaces request
- user approves/rejects/revises
- run continues

That is fine for fully autonomous mode, but it is not fine when the desired UX is: "ask me before doing risky things".

## Product principle

OpenVide should support two execution styles:

1. **Auto mode**
   - current behavior
   - agent proceeds in a permissive/autonomous mode

2. **Ask mode**
   - agent pauses when approval is required
   - app surfaces a structured approval card
   - user chooses what to do

This spec defines **Ask mode**.

## Scope

In scope:
- interactive approval prompts for live runs
- command execution approval
- file modification approval
- network/external side-effect approval
- resume flow after user decision
- UI in phone app, G2 web UI, and glasses-safe G2 rendering

Out of scope for V1:
- bulk approval queues across many sessions
- policy engine with regex allowlists
- approvals for scheduled runs or team runs without active user presence
- granular partial patch editing in-app

## V1 user stories

### 1. Command approval
As a user, when the agent wants to run a command, I want to see the exact command and choose:
- Approve once
- Reject
- Abort run

### 2. File change approval
As a user, when the agent wants to write or edit files, I want to see a short summary and optionally the target files before approving.

### 3. Clarification prompt
As a user, when the agent needs a decision that is not just yes/no, I want to reply with text and let the run continue.

### 4. Glasses-safe interaction
As a G2 glasses user, I want a minimal prompt card with 2 to 4 choices that I can act on without reading a wall of text.

## UX model

## Session states
Extend session lifecycle with a paused-for-user state.

New state:
- `awaiting_approval`

Current nearby state already exists:
- `awaiting_input`

Rule:
- use `awaiting_approval` when the agent is blocked on a structured permission request
- use `awaiting_input` for general open text follow-up

## New message/block type
Add a first-class content block for approval prompts.

### New `AiContentBlockType`
- `permission_request`

### Proposed fields on `AiContentBlock`
```ts
permissionRequestId?: string;
permissionKind?: "command" | "file_write" | "network" | "dangerous_action" | "generic";
permissionStatus?: "pending" | "approved" | "rejected" | "cancelled" | "expired";
permissionTitle?: string;
permissionDescription?: string;
permissionCommand?: string;
permissionFiles?: string[];
permissionReason?: string;
permissionRisk?: "low" | "medium" | "high";
permissionOptions?: Array<{
  id: string;
  label: string;
  kind: "approve_once" | "reject" | "abort_run" | "reply";
}>;
```

V1 minimum for command approval:
- id
- kind
- title
- description
- exact command
- options
- status

## User actions
V1 supported actions:
- `approve_once`
- `reject`
- `abort_run`
- `reply` with text

Notes:
- No "approve always" in V1, because that drifts toward policy management.
- If we later want it, add it as V2.

## Rendering

### Main app
Render a dedicated approval card similar in visual weight to `CommandExecutionCard`.

Card sections:
- title, e.g. `Permission needed`
- short reason, e.g. `Codex wants to run a shell command`
- exact command or file list
- risk badge
- action buttons

Buttons:
- Approve once
- Reject
- Abort run
- Optional text reply input when the request accepts clarification

### G2 web client
G2 currently renders simple chat messages and content bubbles. For V1, add a compact permission card component with:
- one-line title
- one-line summary
- expandable details for command/file list
- 2 to 3 action buttons

### Even Realities glasses UI
Glasses should get a reduced-action card:
- title
- 1 line summary
- abbreviated command if needed
- D-pad or tap actions for:
  - Approve
  - Reject
  - More

If details overflow:
- `More` opens a second screen with full command text and an `Abort run` option

Glasses constraints:
- never show huge diffs by default
- never require typing for the common yes/no case
- keep choices at 2 to 4 max per screen

## Transport and protocol

## Principle
Permission prompts must be structured protocol events, not parsed heuristically from human-readable stderr.

## New stream event
Add a new normalized stream event emitted by daemon-side runners:

```ts
{
  type: "permission_request",
  requestId: string,
  kind: "command" | "file_write" | "network" | "dangerous_action" | "generic",
  title: string,
  description?: string,
  command?: string,
  files?: string[],
  reason?: string,
  risk?: "low" | "medium" | "high",
  options: Array<{
    id: string,
    label: string,
    kind: "approve_once" | "reject" | "abort_run" | "reply"
  }>
}
```

## New decision event or RPC
OpenVide needs a way to send the user decision back to the running session.

Suggested daemon RPC:
- `session.permission.respond`

Payload:
```ts
{
  sessionId: string,
  requestId: string,
  decision: "approve_once" | "reject" | "abort_run" | "reply",
  replyText?: string
}
```

Response:
```ts
{ ok: true }
```

## Session behavior
When a permission request is emitted:
1. session state becomes `awaiting_approval`
2. streaming stays attached but no new agent action executes
3. UI shows the pending card
4. on user decision, daemon forwards the decision to the tool runtime
5. session returns to `running` or terminal state

## Adapter architecture

## Requirement
The permission flow must work across multiple tool backends.

Therefore the protocol should be tool-agnostic at the UI layer.

### Tool adapter responsibility
Each tool runner or adapter must convert its native permission mechanism into the normalized OpenVide permission event.

### UI responsibility
UI must only understand OpenVide's normalized permission event, not tool-specific raw messages.

## Backend implementation strategy

### Phase 1: Codex-first
Implement this first for Codex, because that is the immediate pain point.

Primary source:
- Codex app-server structured server requests.

Relevant app-server request methods observed in generated local bindings:
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `execCommandApproval`
- `applyPatchApproval`

Important implementation detail:
- These are server-initiated JSON-RPC requests, not notifications.
- They include an `id` and must be answered by the OpenVide daemon client.
- The current `codexAppServerRunner` treats unknown `id` messages as stale
  responses and returns early, so approval requests will likely be ignored
  until that request path is added.

CLI fallback:
- Codex CLI output parsing should not be the first implementation path.
- Use it only if the server deployment proves the app-server approval request
  path is unavailable or unusable for the installed Codex version.

Important rule:
- structured runtime hooks preferred
- parsing plain prose is acceptable only as a temporary bridge

### Phase 2: Claude and Gemini
If Claude or Gemini can surface approval-like states, map them into the same protocol.
If they remain auto-only, the UI layer still remains compatible for future use.

## Runtime modes
Introduce explicit permission mode in OpenVide session config.

### Proposed session/tool config
```ts
permissionMode?: "auto" | "ask";
```

Behavior:
- `auto`
  - current behavior, e.g. full-auto / skip permissions / yes mode
- `ask`
  - use approval-capable path and surface prompts to UI

Codex V1 mapping:
- `auto` keeps the current Codex behavior:
  - CLI: `--full-auto`
  - app-server: `approvalPolicy: "never"`
- `ask` should prefer Codex app-server:
  - `approvalPolicy: "on-request"` or an equivalent granular policy
  - `approvalsReviewer: "user"`
  - explicit sandbox policy rather than relying on defaults
- If app-server Ask mode is unavailable on the host, fail visibly instead of
  silently downgrading to Auto mode.

This should be configurable in:
- app settings for default tool behavior
- per-session override
- bridge host config later if needed

## Suggested V1 settings UX
Per tool:
- Claude permissions: Auto / Ask
- Codex permissions: Auto / Ask
- Gemini permissions: Auto / Ask

If a tool/backend does not support `ask`, show:
- `Ask mode not available for this backend yet`

## Failure and timeout behavior

### Timeout
If a permission request sits unanswered too long:
- mark request as `expired`
- session moves to `failed` or `awaiting_input` depending on backend capability

Suggested V1 default timeout:
- no auto-expiry while the app is actively connected
- optional daemon-side expiry for detached sessions later

### Disconnects
If UI disconnects while a request is pending:
- request remains pending in daemon session state
- reconnect should replay the latest pending permission request

### Duplicate taps
Decision endpoint must be idempotent:
- first valid response wins
- later duplicates return success with current status or a harmless no-op

## Persistence
Pending approval requests must be persisted in session state, not only in transient websocket memory.

Suggested daemon session fields:
```ts
pendingPermission?: {
  requestId: string;
  kind: string;
  title: string;
  description?: string;
  command?: string;
  files?: string[];
  reason?: string;
  risk?: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
}
```

Reason:
- app reloads
- websocket reconnects
- handoff from phone to glasses or vice versa

## Security principles

1. Always show the exact command for command approvals.
2. Never collapse chained shell commands into a summarized label only.
3. Show target files for file write approvals.
4. Approval is scoped to one pending request only.
5. No hidden approval side effects.
6. For external/network actions, say that clearly.

## V1 implementation slices

### Slice 0: backend proof
- verify the server's installed Codex version exposes app-server approval
  requests
- prove OpenVide can receive one server-initiated approval request
- prove OpenVide can answer it with a JSON-RPC response and the turn resumes

### Slice 1: data model
- add `awaiting_approval` session status
- add `permission_request` block type
- add pending permission state on daemon sessions

### Slice 2: UI cards
- main app permission card
- G2 web permission card
- glasses-safe compact permission card

### Slice 3: decision transport
- add `session.permission.respond` RPC
- wire app and G2 actions to it

### Slice 4: Codex backend
- start Codex app-server Ask mode with an approval-capable policy
- detect native Codex app-server permission requests
- answer the original app-server request id after the user decision
- map them to normalized events
- pause and resume correctly

### Slice 5: settings
- add `permissionMode: auto | ask`
- default Codex to `auto` initially

## Open questions

1. Does the server deployment run a Codex version with the same app-server
   approval request schema as the local machine?
2. Which exact app-server approval policy should be used for V1:
   `on-request`, `untrusted`, or a granular policy?
3. Should file-write approvals show full diffs in V1, or only filenames plus optional details?
4. Should glasses support text reply in V1, or only approve/reject/abort?
5. Should bridge/API callers also be able to answer permission prompts remotely?

## Recommended first milestone

Build a narrow but real V1:
- Codex only
- command approvals only
- app + G2 web support
- glasses get compact approve/reject rendering
- no approve-always policy yet

That gets the core loop working:
- agent asks
- user decides
- session continues

without inventing a huge permission framework on day one.
