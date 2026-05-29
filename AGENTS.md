# opencode-voice-call

Voice call mode for opencode — continuous voice pickup, local transcription, auto-submit. Works as a VS Code extension (status bar button) and as a TUI plugin (`/call`, `/hang`).

## Project structure

```
opencode-voice-call/
├── src/
│   ├── engine/
│   │   ├── recorder.ts        # sox recording with VAD (1.5s silence)
│   │   ├── transcriber.ts     # whisper-cpp wrapper (base.en model)
│   │   └── call-loop.ts       # orchestration loop
│   ├── extension.ts           # VS Code extension entry (status bar, terminal focus)
│   └── tui-plugin.ts          # opencode TUI plugin (/call, /hang)
├── images/
│   └── mic-icon.svg           # Green/gray mic icon for status bar
├── package.json               # VS Code extension manifest + deps
├── tsconfig.json
├── esbuild.js                 # Bundle for VS Code extension
├── PLAN.md                    # Architecture, status tracker, checklist
├── AGENTS.md                  # This file — instructions for AI agents
├── README.md
└── .gitignore
```

## Two entry points

| Mode | File | Activation |
|---|---|---|
| VS Code | `src/extension.ts` | Status bar button (bottom-left) |
| Terminal | `src/tui-plugin.ts` | `/call` and `/hang` commands in opencode TUI |

## Shared engine (`src/engine/`)

- **recorder.ts** — Spawns `sox` with silence detection. Stops after 1.5s of silence. Returns a WAV file path.
- **transcriber.ts** — Calls `whisper-cli` with the `base.en` model on the WAV file. Returns transcribed text.
- **call-loop.ts** — Orchestrates the loop: record → transcribe → submit. Runs until cancelled.

## Key constraints

- **Zero API cost** — all transcription is local via whisper-cpp. No OpenAI or cloud STT calls.
- **No malware** — every dep is open source and auditable. Only external deps are `sox` (system pkg) and `whisper-cpp` (open source C++).
- **Private until tested** — repo is private on GitHub. Publish to VS Code marketplace later.

## Prerequisites (one-time)

```
sudo apt install sox
# Download whisper-cpp + base.en model (140MB)
# npm install
```

## Build commands

```
npm install          # install deps
npm run compile      # esbuild bundle + typecheck
npm run package      # create .vsix for local install
```

## VS Code extension details

- Creates `vscode.window.createStatusBarItem()` aligned left
- Icon toggles between green mic (active) and gray mic (idle)
- On click: finds opencode terminal, focuses it, reads `_EXTENSION_OPENCODE_PORT` from env
- Submits transcriptions via `POST /tui/append-prompt` + `/tui/submit-prompt`
- On second click: kills sox, stops loop, reverts icon

## TUI plugin details

- Registers `/call` and `/hang` slash commands
- `/call` starts the same recording loop, submits via opencode SDK
- Shows toast notifications for status changes
- On call end, cleans up sox process

## Voice-aware question protocol

When the voice call is active and you need to ask the user a question:

1. Use the `question` tool normally — opencode renders the options in the TUI
2. In your response, **tell the user exactly what to say** for each option (e.g. "Say 1 for ..." or "Say approve to continue")
3. The user speaks their answer → it gets transcribed → submitted via `session.prompt()` → arrives in the conversation
4. Read the answer from the next `session.prompt()` message in the conversation history
5. Do NOT expect `tui.control.next/response` to work for `question` tool prompts — they use a different internal channel

## ⚠️ Feature stability contract

**Read `FEATURES.md` before every change.** It lists every feature this project
provides. If your change breaks a listed feature, the change does not ship.

Rules:
1. Read `FEATURES.md` before any code change
2. After every change, verify all features still work
3. New features are added to `FEATURES.md` at implementation time
4. Feature removal requires explicit deprecation, not accidental deletion
5. "I didn't know that was a feature" is not an excuse — it's in the file

## GitHub workflow

- Branch from main for each feature
- Commit message tells the why, diff tells the what
- Run `npm run compile` before committing
- Ask before pushing or raising PRs
