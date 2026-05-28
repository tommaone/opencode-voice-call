# opencode-voice-call

Voice dictation for VS Code. Speak, transcribe locally, insert at cursor.

- **Free**: All transcription is local via whisper-cpp — zero API costs
- **Private**: Not yet published to marketplace

## Features

### VS Code (extension)
- **Status bar button** `$(mic) Call` — bottom-left, click to start/stop
- **Keyboard shortcut** `ctrl+shift+m` / `cmd+shift+m`
- Transcribed text is inserted at the active cursor position

### Terminal TUI (plugin)
- **Slash command** `/call` — start continuous voice recording and auto-submit
- **Slash command** `/hang` — end active voice call
- **Requires** registering the plugin in `tui.jsonc` (see below)

## TUI plugin setup

Add to `~/.config/opencode/tui.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./plugins/voice-call/tui-plugin.js"]
}
```

After registering, restart opencode TUI. Use `/call` to start and `/hang` to stop.

See [PLAN.md](https://github.com/tommaone/opencode-voice-call/blob/HEAD/PLAN.md) for architecture and [AGENTS.md](https://github.com/tommaone/opencode-voice-call/blob/HEAD/AGENTS.md) for project conventions.
