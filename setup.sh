#!/usr/bin/env bash
set -euo pipefail

MODEL="small.en"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin"
MODEL_DIR="$HOME/.local/share/whisper-cpp"
MODEL_PATH="${MODEL_DIR}/ggml-${MODEL}.bin"
PLUGIN_DIR="$HOME/.config/opencode/plugins/voice-call"
PLUGIN_SRC="$(dirname "$0")/dist/tui-plugin.js"
EXT_DIR="$(dirname "$0")"
EXT_ID="tommaone.opencode-voice-call"

echo "==> Installing system dependencies"
if command -v apt &>/dev/null; then
  sudo apt update && sudo apt install -y sox curl build-essential git cmake libsox-fmt-pulse pulseaudio-utils 2>&1 | tail -3
elif command -v pacman &>/dev/null; then
  sudo pacman -Sy --noconfirm sox curl base-devel git cmake 2>&1 | tail -3
elif command -v dnf &>/dev/null; then
  sudo dnf install -y sox curl gcc gcc-c++ make git cmake pulseaudio-utils 2>&1 | tail -3
elif command -v brew &>/dev/null; then
  brew install sox curl cmake 2>&1 | tail -3
else
  echo "WARNING: unsupported package manager. Install sox + curl + cmake + build tools manually."
fi

echo "==> Checking Node.js"
if ! command -v node &>/dev/null; then
  echo "Installing Node.js via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 22
fi

echo "==> Checking opencode"
if ! command -v opencode &>/dev/null && [ ! -f "$HOME/.opencode/bin/opencode" ]; then
  echo "Installing opencode..."
  curl -fsSL https://opencode.ai/install.sh | sh
fi
export PATH="$HOME/.opencode/bin:$PATH"

echo "==> Checking whisper-cli"
if ! command -v whisper-cli &>/dev/null; then
  echo "Building whisper.cpp from source..."
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp /tmp/whisper-cpp
  cmake -S /tmp/whisper-cpp -B /tmp/whisper-cpp/build \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$HOME/.local" \
    -DCMAKE_INSTALL_RPATH='$ORIGIN/../lib'
  cmake --build /tmp/whisper-cpp/build -j "$(nproc)"
  cmake --install /tmp/whisper-cpp/build
  rm -rf /tmp/whisper-cpp
  echo "  whisper-cli installed to ${HOME}/.local/bin/"
  echo "  Libraries installed to ${HOME}/.local/lib/"
fi

# Ensure ~/.local/bin is in PATH for this session
case ":$PATH:" in
  *:"$HOME/.local/bin":*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac

echo "==> Downloading ${MODEL} model (~466MB, English-only)"
mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_PATH" ]; then
  curl -L -o "$MODEL_PATH" "$MODEL_URL"
else
  echo "  Model already exists, skipping download"
fi

echo "==> Building extension"
if [ ! -d "$EXT_DIR/node_modules" ]; then
  npm install --prefix "$EXT_DIR"
fi
node "$EXT_DIR/esbuild.js"

echo "==> Installing VS Code extension"
VSIX_PATH="$EXT_DIR/opencode-voice-call-0.1.0.vsix"
npx --prefix "$EXT_DIR" vsce package --allow-missing-repository 2>/dev/null || true

# Find code CLI — WSL uses remote-cli path
CODE_BIN="$(command -v code 2>/dev/null || true)"
if [ -z "$CODE_BIN" ]; then
  for candidate in \
    "$HOME/.vscode-server/bin/"*/bin/remote-cli/code \
    "$HOME/.vscode/bin/code"; do
    if [ -x "$candidate" ]; then CODE_BIN="$candidate"; break; fi
  done
fi

if [ -n "$CODE_BIN" ] && [ -f "$VSIX_PATH" ]; then
  "$CODE_BIN" --install-extension "$VSIX_PATH" && echo "  Installed from .vsix" || echo "  .vsix install failed — run manually: $CODE_BIN --install-extension $VSIX_PATH"
elif [ ! -x "${CODE_BIN:-/nonexistent}" ]; then
  echo "  WARNING: VS Code CLI not found. Install extension manually:"
  echo "    code --install-extension $VSIX_PATH"
elif [ ! -f "$VSIX_PATH" ]; then
  echo "  WARNING: .vsix not found at $VSIX_PATH"
fi

echo "==> Installing TUI plugin"
mkdir -p "$PLUGIN_DIR"
if [ -f "$PLUGIN_SRC" ]; then
  cp "$PLUGIN_SRC" "$PLUGIN_DIR/tui-plugin.js"
else
  echo "ERROR: dist/tui-plugin.js not found after build"
  exit 1
fi

CONFIG_FILE="$HOME/.config/opencode/tui.jsonc"
if [ ! -f "$CONFIG_FILE" ]; then
  mkdir -p "$(dirname "$CONFIG_FILE")"
  cat > "$CONFIG_FILE" << EOF
{
  "\$schema": "https://opencode.ai/tui.json",
  "plugin": ["${PLUGIN_DIR}/tui-plugin.js"]
}
EOF
  echo "  Created ${CONFIG_FILE}"
else
  echo "  ${CONFIG_FILE} already exists — ensure it points to: ${PLUGIN_DIR}/tui-plugin.js"
fi

echo ""
echo "Done. Restart VS Code and opencode TUI."
echo "  - VS Code: click the mic icon (bottom-left) or Ctrl+Shift+M"
echo "  - TUI:     /call to start, /hang to stop"
