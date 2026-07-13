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

The script installs everything: Node.js, opencode, sox, whisper.cpp (built from source), the small.en English-only model (~466MB), the VS Code extension, and the TUI plugin config.

## Manual setup

### Prerequisites

```bash
# System (Debian/Ubuntu)
sudo apt install sox curl cmake build-essential git libsox-fmt-pulse pulseaudio-utils

# System (Arch)
sudo pacman -S sox curl cmake base-devel git

# System (Fedora)
sudo dnf install -y sox curl cmake gcc gcc-c++ make git pulseaudio-utils

# macOS
brew install sox curl cmake
```

### WSL note

In WSL2, audio flows through the WSLg PulseAudio bridge (`/mnt/wslg/PulseServer`). Ensure:
- `PULSE_SERVER` env var is set (usually automatic in WSL2 on Windows 11)
- `libsox-fmt-pulse` is installed (Debian/Ubuntu)
- Your Windows host has a working microphone (check Sound settings)

```bash
# whisper.cpp (build from source)
git clone https://github.com/ggerganov/whisper.cpp
cmake -S whisper.cpp -B whisper.cpp/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$HOME/.local" \
  -DCMAKE_INSTALL_RPATH='$ORIGIN/../lib'
cmake --build whisper.cpp/build -j "$(nproc)"
cmake --install whisper.cpp/build
rm -rf whisper.cpp

# Model (English-only, ~466MB — matches code in transcriber.ts)
mkdir -p ~/.local/share/whisper-cpp
curl -L -o ~/.local/share/whisper-cpp/ggml-small.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin

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
# Build .vsix package
npm run package

# Install (WSL — uses .vscode-server path)
code --install-extension opencode-voice-call-0.1.0.vsix

# Or on native Linux/macOS:
# code --install-extension opencode-voice-call-0.1.0.vsix
```

> **Note:** Symlinks don't work — VS Code removes them on restart. Always use `.vsix`.

### Install TUI plugin

```bash
mkdir -p ~/.config/opencode/plugins/voice-call
cp dist/tui-plugin.js ~/.config/opencode/plugins/voice-call/
```

Create `~/.config/opencode/tui.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["~/.config/opencode/plugins/voice-call/tui-plugin.js"]
}
```

> **Warning:** Do NOT put the `plugin` key in `opencode.jsonc` — that causes a startup crash. It must go in `tui.jsonc`.

## Usage

| Action | VS Code | TUI |
|--------|---------|-----|
| Start | Click `$(mic) Call` or `Ctrl+Shift+M` | `/call` |
| Stop | Click again or `Ctrl+Shift+M` | `/hang` |

Speak after starting — silence detection (0.8s) triggers transcription automatically.

## How it works

```
Microphone → sox (VAD) → WAV → whisper.cpp → text → opencode SDK → submission
```

- **recorder.ts** — sox with silence detection (1.5s threshold)
- **transcriber.ts** — whisper.cpp with small.en English-only model (auto-detects language, skips non-English)
- **call-loop.ts** — orchestration loop (record → transcribe → submit)
- **extension.ts** — VS Code status bar integration
- **tui-plugin.ts** — opencode TUI slash commands
