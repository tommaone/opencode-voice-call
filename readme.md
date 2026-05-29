# opencode Voice Call

Voice dictation for opencode and VS Code. Speak, transcribe locally with whisper.cpp, auto-submit.

- **Zero API cost** — 100% local transcription via whisper.cpp
- **Works in TUI** — `/call` and `/hang` slash commands
- **Works in VS Code** — status bar button + `Ctrl+Shift+M`
- **Background** — recording runs while you keep working

## Quick start

```bash
git clone https://github.com/tommaone/opencode-voice-call
cd opencode-voice-call
./setup.sh
```

The script installs everything: Node.js, opencode, sox, whisper.cpp (built from source), the small multilingual model (~465MB), the VS Code extension, and the TUI plugin config.

## Manual setup

### Prerequisites

```bash
# System
sudo apt install sox curl     # Debian/Ubuntu
sudo pacman -S sox curl        # Arch

# whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp
cmake -S whisper.cpp -B whisper.cpp/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$HOME/.local" \
  -DCMAKE_INSTALL_RPATH='$ORIGIN/../lib'
cmake --build whisper.cpp/build -j "$(nproc)"
cmake --install whisper.cpp/build
rm -rf whisper.cpp

# Model
mkdir -p ~/.local/share/whisper-cpp
curl -L -o ~/.local/share/whisper-cpp/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

# Node deps
npm install
```

> The `cmake --install` step places the binary in `~/.local/bin/` and shared libraries in `~/.local/lib/`. The `-DCMAKE_INSTALL_RPATH='$ORIGIN/../lib'` flag ensures the binary finds its libraries at runtime — no `LD_LIBRARY_PATH` or sudo needed. Make sure `~/.local/bin` is in your `PATH` (most distros include it by default).

### Build

```bash
npm run compile
```

### Install VS Code extension

```bash
ln -s "$PWD" ~/.vscode/extensions/tommaone.opencode-voice-call
```

### Install TUI plugin

```bash
mkdir -p ~/.config/opencode/plugins/voice-call
cp dist/tui-plugin.js ~/.config/opencode/plugins/voice-call/
```

Add to `~/.config/opencode/tui.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["~/.config/opencode/plugins/voice-call/tui-plugin.js"]
}
```

## Usage

| Action | VS Code | TUI |
|--------|---------|-----|
| Start | Click `$(mic) Call` or `Ctrl+Shift+M` | `/call` |
| Stop | Click again or `Ctrl+Shift+M` | `/hang` |

Speak after starting — silence detection (1.5s) triggers transcription automatically.

## How it works

```
Microphone → sox (VAD) → WAV → whisper.cpp → text → opencode SDK → submission
```

- **recorder.ts** — sox with silence detection (1.5s threshold)
- **transcriber.ts** — whisper.cpp with small multilingual model (auto-detects language, skips non-English)
- **call-loop.ts** — orchestration loop (record → transcribe → submit)
- **extension.ts** — VS Code status bar integration
- **tui-plugin.ts** — opencode TUI slash commands
