# PLAN — opencode-voice-call

Voice call mode for opencode. Continuous voice pickup, local transcription, auto-submit.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    opencode-voice-call                           │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │              │    │              │    │                   │  │
│  │  recorder.ts │───▶│ transcriber  │───▶│  call-loop.ts     │  │
│  │              │    │ .ts          │    │                   │  │
│  │  sox + VAD   │    │ whisper-cpp  │    │  orchestrates     │  │
│  │  1.5s silence│    │ base.en      │    │  record→transcribe│  │
│  │              │    │              │    │  →submit          │  │
│  └──────────────┘    └──────────────┘    └────────┬──────────┘  │
│                                                   │             │
│                    ┌──────────────────────────────┘             │
│                    ▼                                           │
│  ┌──────────────────────────────┐  ┌────────────────────────┐  │
│  │  extension.ts                │  │  tui-plugin.ts         │  │
│  │  VS Code status bar button   │  │  /call and /hang cmds  │  │
│  │  finds terminal → focuses →  │  │  toast notifications   │  │
│  │  HTTP to opencode server     │  │  SDK submit            │  │
│  └──────────────────────────────┘  └────────────────────────┘  │
│                                                                 │
│  Both submit transcribed text to the local opencode server      │
│  → AI sees it as a user message → responds in the chat          │
└─────────────────────────────────────────────────────────────────┘
```

## Flow (VS Code)

```
[🎤 gray] idle
  ↓ click
[🎤 green] active
  → vscode.window.terminals.find("opencode").show()
  → start engine loop:
      sox rec → whisper transcribe → POST /tui/append-prompt + submit
  → loop continues (utterance by utterance)
  ↓ click
[🎤 gray] idle
  → kill sox, stop loop
```

## Flow (Terminal / TUI)

```
opencode> /call
  → toast "🟢 Call active"
  → start engine loop (same core)
  → submits via SDK: client.session.prompt()
  → loop continues

opencode> /hang
  → toast "🔴 Call ended"
  → kill sox, stop loop
```

## Dependencies

| What | Why | Size | Cost |
|---|---|---|---|
| `sox` | Audio capture + VAD | ~1MB | Free, `apt install` |
| `whisper-cpp` | Local transcription | ~10MB binary | Free, open source |
| `base.en` model | Whisper model file | 140MB | Free download |
| `@opencode-ai/sdk` | Submit to opencode | small | Free, npm |
| `esbuild` | Bundle VS Code ext | dev dep | Free, npm |
| `@types/vscode` | VS Code API types | dev dep | Free, npm |

## Files

```
src/
├── engine/
│   ├── recorder.ts        ~60 lines   — sox spawn, VAD, temp file management
│   ├── transcriber.ts     ~50 lines   — whisper-cli call, output parsing
│   └── call-loop.ts       ~80 lines   — orchestration, state machine
├── extension.ts           ~150 lines  — activate, status bar, commands, HTTP submit
└── tui-plugin.ts          ~100 lines  — /call, /hang handlers, SDK submit

images/
└── mic-icon.svg           SVG — green + gray states

Config files:
├── package.json           VS Code manifest + npm deps
├── tsconfig.json          TypeScript config
├── esbuild.js             Bundle script
├── .gitignore
├── README.md
├── AGENTS.md
└── PLAN.md                ← this file
```

## Status tracker

- [x] PLAN.md — architecture, flow, checklist
- [x] AGENTS.md — project context for AI agents
- [x] .gitignore
- [x] README.md
- [x] package.json + tsconfig.json + esbuild.js
- [x] mic-icon.svg (green/gray states)
- [x] `src/engine/recorder.ts` — sox recording with VAD
- [x] `src/engine/transcriber.ts` — whisper-cpp wrapper
- [x] `src/engine/call-loop.ts` — orchestration loop
- [x] `src/extension.ts` — VS Code extension
- [x] `src/tui-plugin.ts` — opencode TUI plugin
- [x] `npm install` + `npm run compile` — verify it builds
- [ ] Create GitHub private repo + push — **you're here**
- [ ] Install `.vsix` locally in VS Code — verify button appears
- [ ] Test: click call → terminal focuses → speaks → transcribes → submits
- [ ] Test: `/call` in standalone terminal → same flow
- [ ] Test: hang up mid-utterance → clean stop
- [ ] Verify no API calls to cloud (100% local STT)
- [ ] Polish: error handling, edge cases, cleanup

## Future phases

- [ ] Wake word ("Hi Pickle") via Porcupine/Snowboy
- [ ] VS Code marketplace publish
- [ ] Config UI for model selection, VAD sensitivity
- [ ] Multi-language support
- [ ] Real-time VAD visualization in status bar
