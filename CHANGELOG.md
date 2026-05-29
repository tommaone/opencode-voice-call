# Changelog

## 2026-05-29

### Changed (headset reset)
- Silence duration: `1.5s` → `0.8s` for faster turn-taking
- Reverted to original VAD-based recording (no chunk approach, no whisper VAD)
- Removed input gain (`0dB`) — headset doesn't need boost
- VAD threshold: `3%` — works with close mic, rejects noise
- Removed `lowpass 7500` and `compand` filters — unnecessary with clean headset signal
- Removed `OPENCODE_WHISPER_THREADS` env var — medium.en was too slow, back to small.en
- whisper VAD disabled — sox amplitude VAD is sufficient for close mic

### Added
- `OPENCODE_AUDIO_DEVICE` env var — select PulseAudio source or ALSA device
- `OPENCODE_VAD_THRESHOLD` env var — silence threshold % (default 3)
- `OPENCODE_VAD_SILENCE` env var — silence duration in seconds (default 0.8)
- `highpass 80Hz` filter — removes low-frequency rumble without affecting speech
- `CHANGELOG.md` — this file

### Fixed
- Stale `SILENCE_DURATION` reference after rename to `VAD_SILENCE`
- Whisper model: `medium.en` → `small.en` (fast, good enough for close mic)

### Removed
- `OPENCODE_MIC_GAIN` env var — not needed (headset at close range)
- `OPENCODE_CHUNK_SECONDS` env var — chunk approach reverted
- `--vad` whisper flag — sox VAD handles it
- `compand` noise gate — unnecessary with clean input
- `lowpass 7500` filter — unnecessary with headset
