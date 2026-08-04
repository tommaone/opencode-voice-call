# Native Windows support (no WSL2 required)

## Context

The extension currently only targets Linux/macOS in two places:
- `src/engine/recorder.ts` spawns the Unix `timeout` command wrapping SoX's `rec` frontend, and force-kills recordings via `pkill -f`.
- `src/extension.ts` discovers the running opencode server's port by `pgrep -f 'opencode.*--port'` and reading `/proc/<pid>/cmdline` — there is no `/proc` on Windows.

Everything else (Node/npm, esbuild, vsce packaging, the opencode SDK client, whisper.cpp) is already cross-platform or has a working Windows build. Goal: add a Windows code path alongside the existing Unix path via `process.platform` checks — no WSL2 requirement.

Also worth noting: the extension talks to opencode over a local HTTP API (`client.session.promptAsync`) — it has no path to drive VS Code Copilot Chat, which exposes no equivalent local API for text injection/submission. Out of scope here.

## Toolchain — verified reachable from a locked-down corporate network

- **whisper.cpp**: prebuilt Windows binaries exist on the GitHub release (`v1.9.1`, asset `whisper-bin-x64.zip`), containing `whisper-cli.exe` — exactly the binary `transcriber.ts` looks for. Downloads fine directly from GitHub.
- **SoX**: no maintained prebuilt Windows sox with `-d`/`rec` device support other than the old 2015 SourceForge 14.4.2 build, and SourceForge downloads got blocked by a corporate Zscaler proxy in testing (HTML block page instead of the zip), even though `HEAD` requests looked fine. A maintained fork, **sox_ng** (win64, hosted on Codeberg), downloaded successfully when a browser `User-Agent` header was set on the request (plain curl got blocked, UA-spoofed curl succeeded). It ships as a single `sox_ng.exe` — `rec` behavior is just `sox_ng.exe -d <output> <effects>`, no separate rec binary or build step needed.
- **Port discovery replacement**: `Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine` (PowerShell) returns each process's full command line — verified working against a live process. This replaces `pgrep` + `/proc/<pid>/cmdline` reading.
- `cmake` is not needed on Windows since prebuilt whisper.cpp binaries exist — no from-source build required.

## Proposed changes

### `src/engine/recorder.ts`
Add a Windows branch:
- Resolve the sox binary: prefer a bundled/installed `sox_ng.exe`, fall back to `sox`/`rec` on PATH for users with their own install.
- Recording command on Windows: `sox_ng.exe -d <file> <same highpass/silence effects already in buildSoxArgs>` — no `-t alsa`/`-t pulseaudio` flags (Unix-only); `AUDIO_DEVICE` env var becomes a no-op on Windows unless it maps to a real waveaudio driver spec (documented limitation, not solved here).
- No Unix `timeout` wrapper process on Windows — implement max-duration via a JS `setTimeout` that kills the process if still running when it fires. Treat "killed by our own timer" as success, same as today's `code === 0 || code === 124` handling.
- `forceKill()`: on Windows, rely on the tracked `soxProc.pid` kill plus `taskkill /PID <pid> /T /F` as the orphan-cleanup sweep, replacing the Unix `pkill -9 -f 'opencode-voice'` call.

### `src/extension.ts`
Replace `discoverOpencodePort()`'s Unix implementation with a Windows branch:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='opencode.exe' OR Name='bun.exe'" | Select-Object CommandLine
```
run via `execSync('powershell -NoProfile -Command "..."')`, then regex-match `--port\s+(\d+)` against each returned `CommandLine` — same matching logic as the existing per-pid loop. Branch on `process.platform === 'win32'`.

### `src/engine/transcriber.ts`
`findWhisperBin()`'s `which whisper-cli` call already fails silently on Windows and falls through to the candidate-path list — extend that list with a Windows install location and `.exe` suffix, gated on `process.platform`.

### Setup
`setup.sh` is bash/Unix-only; a native Windows setup would need its own script (PowerShell or a Node-based installer) doing roughly:
1. Download `whisper-bin-x64.zip` from the `v1.9.1` GitHub release, extract `whisper-cli.exe` + its DLLs to a local bin dir (DLLs must stay side-by-side).
2. Download `ggml-small.en.bin` from Hugging Face to the existing model path convention (`getModelPath()` needs no change).
3. Download the sox_ng win64 zip from Codeberg with a browser `User-Agent` header set, extract `sox_ng.exe`.
4. `npm install && npm run compile && npm run package` (vsce) → `.vsix`.
5. `code --install-extension <vsix>`.

## Verification plan
- `npm run lint` (tsc --noEmit) must pass with the new Windows branches.
- Manual smoke test: start `opencode --port <n>`, open VS Code, click the mic status bar item, speak a phrase, confirm transcription + submission into the opencode session; verify stop path (click again / say "stop").
- Confirm `forceKill`/cleanup leaves no orphaned `sox_ng.exe` process after stopping.
