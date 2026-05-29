# Feature Registry

Every feature this project provides. **Never break a listed feature.** If a change
breaks one, the change does not ship. Add new features, never regress.

## How to use this file

- Before changing any code, read this file
- After any change, verify all features still work
- If you add a feature, add it here
- If you remove a feature, it goes through explicit deprecation (not accidental deletion)

---

## 1. Voice recording with VAD

sox-based continuous recording with silence detection. Records until 1.5 seconds
of silence, then returns the audio for transcription.

**Files:** `src/engine/recorder.ts`
**Threshold:** `SILENCE_THRESHOLD = "2.7%"` (configurable, lower = more sensitive)
**VAD fix:** `trim 0 0.1` prefix prevents whisper-cpp's "blind spot" bug (first ~100ms
of audio is silent, causing false no-speech detection).

## 2. Local transcription (zero API cost)

Transcription runs entirely locally via whisper-cpp. No cloud calls, no API keys,
no per-transcription costs.

**Files:** `src/engine/transcriber.ts`
**Model:** `ggml-small.bin` (user chose precision over speed)
**Caching:** Model stays loaded in memory; not reloaded per utterance.

## 3. TUI plugin (`/call` and `/hang` commands)

Registers as an opencode TUI plugin. User types `/call` to start, `/hang` to stop.

**Files:** `src/tui-plugin.ts`
**Registration:** Plugin ID `"opencode-voice-call"`, loaded via `tui.jsonc`

## 4. Auto-submit transcribed text

Transcribed speech is automatically submitted to the active opencode session.
The user never touches the keyboard for message submission.

**Files:** `src/tui-plugin.ts` → `submitViaSdk()`

## 5. Interrupt AI mid-response (CRITICAL)

When the user speaks while the AI is responding, the voice submission **interrupts**
the current AI response. The AI stops what it's saying and responds to the new message.

**Mechanism:**
1. `client.session.abort({ path: { id } })` — cancels the current AI response
2. `client.session.promptAsync({ path: { id }, body: { parts } })` — sends new message,
   returns immediately (does not wait for AI to finish)

**This is the single most important UX feature.** Without it, the user must wait
for the AI to finish before speaking, which defeats the purpose of voice input.
`promptAsync` is required over `prompt` to avoid blocking the recording loop.

## 6. Session visible in TUI

The session receiving voice submissions appears in the TUI's session list. The user
can see the conversation history and doesn't lose track of which session is active.

**Mechanism:** At `/call` time, `client.session.list()` gets the most recent session.
If none exists, `tui.executeCommand({ command: "session.new" })` creates one through
the TUI so it's visible. Falls back to TUI submit (clearPrompt + appendPrompt + submitPrompt)
as the last resort.

## 7. Works without pre-selected session

The user can open opencode for the first time, type `/call`, and start speaking.
No need to type a message first, no need to manually create or select a session.

**Files:** `src/tui-plugin.ts` → `ensureVisibleSession()`

## 8. Permission prompt handling

When opencode shows a permission prompt (e.g. "Allow tool X to do Y?"), the user
can respond by voice. The plugin detects the pending prompt and routes the next
utterance as a response.

**Supported voice commands:**
- "yes", "ok", "okay", "fine", "sure", "yep", "yeah" → `"once"` (approve once)
- "approve all", "approve always" → `"always"` (auto-approve)
- "no", "nope", "deny", "reject", "cancel", "stop", "nah" → `"reject"`

**Files:** `src/tui-plugin.ts` → `startPromptWatcher()`, `permissionMode()`

## 9. Interactive prompt handling

When opencode asks for text input (the "ask user" tool), the next utterance is
sent as the response via `tui.control.response()`.

**Files:** `src/tui-plugin.ts` → `startPromptWatcher()`, `submitViaSdk()`

## 10. Status toasts

The plugin shows toast notifications for:
- Call started / ended
- Transcription preview (first 60 chars)
- Errors
- Auto-approve set
- Prompt waiting for response

**Files:** `src/tui-plugin.ts` → `toast()`, callbacks

## 11. Cleanup on start

On plugin load (before starting a call), kills any orphaned sox processes and
cleans temp files from a previous session that was interrupted by an opencode
crash or restart.

**Files:** `src/tui-plugin.ts` → `forceKill()`, `cleanup()`, `cleanAllTempFiles()`

## 12. Cleanup on hang

On `/hang`, stops the recording loop, aborts the prompt watcher, clears the
session ID, and cleans up.

**Files:** `src/tui-plugin.ts` → `/hang` handler

## 13. Error visibility

All errors are shown as toast notifications. No silent `.catch(() => {})` swallowing.
If something fails, the user sees it.

**Files:** `src/tui-plugin.ts`, `src/engine/call-loop.ts`

## 14. Continuous loop

After submitting an utterance, the plugin immediately starts recording the next one.
No manual re-triggering needed.

**Files:** `src/engine/call-loop.ts`

## 15. Temp file cleanup

WAV files are cleaned up after each transcription. No accumulation of temp files
in `/tmp/opencode/`.

**Files:** `src/engine/recorder.ts`, `src/engine/transcriber.ts`

## 16. sox process isolation

Uses process group killing (`forceKill()`) to ensure no orphan sox processes
remain after a crash or unclean shutdown.

**Files:** `src/engine/recorder.ts`

## 17. No concurrent utterances

The plugin does not start recording a new utterance while the previous one is
still being submitted. Each utterance waits for submission to complete before
the next recording begins.

**Files:** `src/engine/call-loop.ts`

## 18. Two parallel implementations (must stay in sync)

The plugin has two entry points with identical core logic:
- **VS Code extension** — `src/extension.ts`, status bar button, shows Listening...
- **TUI plugin** — `src/tui-plugin.ts`, /call and /hang commands

Both share the same engine (`src/engine/`) but have their own session management,
submit logic, and prompt watcher. **Every change to core behavior must be applied
to both files.** This is a tracked feature — not a maintenance burden.
