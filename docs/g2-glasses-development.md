# G2 / Even Hub Development

This is the first file to read when a new agent needs to work on the
OpenVide G2 / Even Realities glasses flow.

## Mental Model

OpenVide is the source of truth for the production G2 client.

```text
Even App webview / simulator / glasses
  -> apps/g2 dev server or packaged Even Hub app
  -> openvide-daemon bridge over HTTPS/WebSocket
  -> daemon-managed Claude/Codex/Gemini sessions
```

Important repos and paths on the local development machine:

```text
<openvide-checkout>
  apps/g2        Even Hub webview + glasses client
  apps/daemon    canonical OpenVide daemon and bridge
  docs/          shared project docs

<even-hub-codex-checkout>
  older Even Hub starter repo; useful as a local simulator/tooling checkout
```

When testing OpenVide G2, start the dev server from `openvide`, not from
`even-hub-codex`. The `even-hub-codex` repo may still be useful because it has
the Even Hub simulator installed locally, but its own `npm run dev` starts the
starter app on port `5174`, not the OpenVide G2 client.

## Official Even Documentation

- Even Hub home: https://hub.evenrealities.com/
- Even Hub overview: https://hub.evenrealities.com/docs/getting-started/overview
- Installation: https://hub.evenrealities.com/docs/getting-started/installation
- Input and events: https://hub.evenrealities.com/docs/guides/input-events
- Simulator reference: https://hub.evenrealities.com/docs/reference/simulator
- Packaging and deployment: https://hub.evenrealities.com/docs/reference/packaging-and-deployment
- CLI reference: https://hub.evenrealities.com/docs/reference/cli

The Even Hub docs describe G2 plugins as normal web apps that use the Even Hub
SDK. The simulator is useful for layout and logic validation, but it is not a
replacement for testing on real glasses.

## Local-Only Files

Do not commit local secrets or machine-specific bootstrap values.

```text
LOCAL_G2_SIMULATOR.md
  Private runbook. Git-excluded via .git/info/exclude.

apps/g2/.env.local
  Local Vite bootstrap for the default OpenVide bridge host.
  Ignored by apps/g2/.gitignore through the *.local rule.
```

Expected `apps/g2/.env.local` shape:

```env
VITE_OPENVIDE_DEV_HOST_NAME=<friendly host name>
VITE_OPENVIDE_DEV_HOST_URL=https://<daemon-bridge-host>
VITE_OPENVIDE_DEV_HOST_TOKEN=<pairing token>
```

The `.env.local` file only seeds the initial dev bridge host. User-facing
settings, bridge hosts, bridge session tokens, voice provider choices, and STT
API keys are managed by the G2 UI and persisted through Even Hub/browser storage
from the running webview.

If you are working from a feature worktree, make sure that worktree has its own
`apps/g2/.env.local`, or symlink it to the trusted local file from the main
checkout. Vite reads env files from the app directory that started the server.

## Daemon / Bridge

G2 talks to the OpenVide daemon bridge, not directly to Codex or Claude.

On the host that runs the daemon:

```sh
cd /path/to/openvide/apps/daemon
npm install -g .
openvide-daemon health
openvide-daemon bridge enable --port 7842
openvide-daemon bridge status
openvide-daemon bridge token --expire 24h
```

For local private tunnels or reverse proxies, the external URL may be different
from the daemon's internal port. Use the externally reachable HTTPS URL in
`apps/g2/.env.local` and in the G2 Hosts screen.

## Start OpenVide G2

From the OpenVide repo root:

```sh
cd <openvide-checkout>
npm --workspace @openvide/g2 run dev
```

Equivalent project scripts:

```sh
yarn g2:dev
cd apps/g2 && npm run dev
```

The G2 dev server uses port `5173`.

```text
Local browser URL: http://localhost:5173/
LAN / phone URL:   http://<mac-lan-ip>:5173/
```

The Even App and physical glasses normally need the LAN URL, not `localhost`,
because the webview runs on the phone. If the LAN IP changed, restart the Vite
server and use the `Network:` URL printed by Vite.

Stop the local G2 server:

```sh
lsof -nP -iTCP:5173 -sTCP:LISTEN
kill <pid>
```

## Start The Simulator

If the simulator is installed in the older starter repo, start only the
simulator from there and point it at the OpenVide G2 URL:

```sh
cd <even-hub-codex-checkout>
./node_modules/.bin/evenhub-simulator http://<mac-lan-ip>:5173/
```

Do not run `npm run dev` in `even-hub-codex` when the goal is to test OpenVide
G2. That starts a different app on port `5174`.

Useful checks:

```sh
curl -s -o /tmp/g2-check.html -w "%{http_code}" http://127.0.0.1:5173/
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

Expected result for OpenVide G2 testing:

- `5173` has the OpenVide G2 Vite server.
- `5174` is empty unless intentionally testing the old starter repo.
- The simulator target URL is the `5173` G2 URL.

## Test On Real Glasses

Hardware path:

1. Start or verify the daemon bridge.
2. Start OpenVide G2 on port `5173`.
3. In the Even Realities app / Even Hub developer flow, load the LAN G2 URL:
   `http://<mac-lan-ip>:5173/`.
4. Confirm the G2 Hosts screen uses the intended bridge host and token.
5. Open Sessions on the phone webview and on the glasses.
6. Create or open a session, send a prompt, and verify live updates on both
   phone and glasses.

Chrome on the phone is only a reachability test. Real hardware testing needs the
Even App webview, because that is where the Even Hub SDK, glasses display, input
events, and microphone permissions are available.

## Voice And Input Checks

Voice provider configuration is in the G2 Settings screen, not in `.env.local`.
The selected provider and API key are persisted by the running G2 app.

For voice testing:

1. Select the STT provider in Settings.
2. Enter the provider API key.
3. Test the phone/webview voice button first.
4. Test glasses `Input` next.
5. Confirm the phone webview shows voice status transitions such as listening,
   processing, recognized text, and send/cancel state.
6. Confirm the glasses return to the session screen and display the user's
   submitted prompt before the assistant response arrives.

For input testing, remember that the simulator can differ from real glasses.
The official Even docs list supported simulator inputs as up, down, click, and
double click, but real hardware scroll/list behavior can differ.

## Packaging

Build and package the G2 app from `apps/g2`:

```sh
cd <openvide-checkout>/apps/g2
npm run pack
```

The package command builds with `VITE_EHPK=1` and runs the Even Hub CLI against
`apps/g2/app.json` and `apps/g2/dist`.

Before packaging for real distribution, review:

- `apps/g2/app.json` permissions
- network access requirements
- bridge URL strategy
- whether the target bridge has a trusted TLS certificate

## Common Failure Modes

- Wrong dev server: OpenVide G2 should be on `5173`; the old starter app uses
  `5174`.
- Wrong repo: start G2 from the active OpenVide checkout or feature worktree,
  not from `even-hub-codex`.
- Missing `.env.local`: G2 starts, but the expected dev bridge host is absent.
- Wrong LAN IP: phone or simulator cannot reach the Mac's Vite server.
- Token mismatch: G2 can load, but bridge calls fail until a fresh daemon bridge
  token is configured.
- No phone dev console: the Even App webview is hard to inspect, so prefer
  visible UI status, simulator checks, and daemon/server logs.
- Simulator-only validation: always repeat risky input, scrolling, microphone,
  and approval-flow changes on physical glasses.
