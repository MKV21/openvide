# Plan: ElevenLabs STT support in OpenVide G2

Status: draft
Date: 2026-04-18

## Goal

Add ElevenLabs as a selectable STT provider in OpenVide G2 so voice input can work with an ElevenLabs API key, alongside the existing providers Soniox, Whisper API, and Deepgram.

## Current state

The current STT implementation is G2-local and wired through `even-toolkit/stt`.

Relevant files:
- `apps/g2/src/input/voice.ts`
- `apps/g2/src/hooks/use-settings.ts`
- `apps/g2/src/screens/settings.tsx`
- `apps/g2/src/types/index.ts`

Current provider list is hardcoded to:
- `soniox`
- `whisper-api`
- `deepgram`

This means ElevenLabs support is blocked in two possible places:
1. OpenVide UI/types/settings do not expose it.
2. `even-toolkit` may not support ElevenLabs STT yet.

## Recommendation

Use a two-path plan:

### Path A, preferred if possible
If `even-toolkit` can be extended cleanly, add ElevenLabs support there and then wire it through OpenVide.

Pros:
- keeps one STT abstraction
- least app-specific glue in OpenVide
- future provider handling stays consistent

Cons:
- depends on external package changes and release cadence

### Path B, fallback and probably fastest
Add an OpenVide-local ElevenLabs adapter in `apps/g2/src/input/voice.ts` and bypass `even-toolkit/stt` only for provider `elevenlabs`.

Pros:
- fastest path to working feature
- fully under our control
- no waiting for upstream package release

Cons:
- one provider handled differently
- more app-local code to maintain

## Proposed implementation

### Phase 1, capability check
1. Inspect `even-toolkit` STT engine API and provider list.
2. Verify whether ElevenLabs already exists in a newer toolkit version.
3. Check ElevenLabs STT mode we want to support first:
   - live streaming microphone STT, or
   - recorded-audio upload STT.

Decision gate:
- If toolkit already supports it or can be patched quickly, do Path A.
- Otherwise do Path B.

### Phase 2, OpenVide settings/UI wiring
Regardless of backend path, update G2 settings model:

1. In `apps/g2/src/types/index.ts`
   - extend `sttProvider` union with `elevenlabs`
   - add `sttApiKeyElevenlabs`

2. In `apps/g2/src/hooks/use-settings.ts`
   - add `sttApiKeyElevenlabs` to defaults
   - extend `VALID_STT_PROVIDERS`
   - preserve normalization for existing users

3. In `apps/g2/src/screens/settings.tsx`
   - add `ElevenLabs` to STT Engine select
   - map selected provider to `sttApiKeyElevenlabs`
   - update label and placeholder text to show `ElevenLabs API Key`

### Phase 3A, toolkit-backed implementation
If `even-toolkit` is the chosen path:

1. Extend toolkit STT provider enum/config.
2. Implement ElevenLabs engine behavior there.
3. Bump `even-toolkit` dependency in `apps/g2/package.json`.
4. Update `apps/g2/src/input/voice.ts` provider allowlist.
5. Test microphone capture end to end.

### Phase 3B, OpenVide-local implementation
If local adapter is chosen:

1. In `apps/g2/src/input/voice.ts`
   - add `elevenlabs` to `VALID_PROVIDERS`
   - branch provider handling
2. Keep existing path for Soniox/Whisper/Deepgram via `even-toolkit/stt`.
3. For ElevenLabs:
   - capture microphone audio locally
   - send to ElevenLabs STT endpoint
   - normalize transcript events into current store actions:
     - `VOICE_START`
     - `VOICE_INTERIM`
     - `VOICE_FINAL`
     - `VOICE_ERROR`
4. Keep transcript merging logic unchanged so the UI behavior stays consistent.

## API design questions

Before implementation, confirm:

1. Does ElevenLabs support real-time streaming STT suitable for browser/webview microphone input in this app?
2. If yes, what auth and transport does it expect?
   - HTTP chunk upload
   - WebSocket
   - multipart file upload
3. Are interim transcripts available, or only final transcripts?
4. Are there browser/CORS constraints for direct client-side calls?
5. Do we need language configuration beyond current `voiceLang` mapping?

## Risks

1. `even-toolkit` may not support ElevenLabs, forcing local adapter work.
2. ElevenLabs may have browser or CORS limitations for direct microphone streaming.
3. If ElevenLabs only supports batch transcription cleanly, UX may feel worse than current live STT providers.
4. Storing one more provider key means checking secure storage migration paths.

## Testing plan

1. Settings persistence
   - select ElevenLabs
   - save API key
   - reload app
   - verify provider and key mapping remain correct

2. Happy path
   - start voice capture
   - speak short phrase
   - verify final transcript appears in composer

3. Error path
   - invalid key
   - network failure
   - unsupported browser environment

4. Regression
   - Soniox still works
   - Whisper API still works
   - Deepgram still works

5. Packaging
   - `yarn g2:check`
   - `yarn g2:build`
   - if needed, Even Hub package build

## Suggested execution order

1. Inspect `even-toolkit` support status.
2. Decide Path A vs Path B.
3. Wire settings/types/UI for ElevenLabs.
4. Implement provider adapter.
5. Run local browser test.
6. Run packaging/build checks.
7. Smoke test on target device.

## My recommendation

Start with Phase 1 immediately. My guess: local OpenVide adapter is the fastest route unless `even-toolkit` already has a near-ready ElevenLabs branch. The current code keeps STT nicely isolated, so this should be a contained change rather than a repo-wide surgery.
