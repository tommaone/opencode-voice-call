# Changelog

## 2026-05-29

### Fixed
- Stale `SILENCE_DURATION` reference after rename to `VAD_SILENCE` — caused ReferenceError on every call start (recorder.ts line 76)

### Changed
- Swapped whisper model `small.en` → `medium.en` (Q5_0, 515MB) for better accuracy at natural speech speed
- VAD threshold: `8%` → `4%` (desk mic at distance can't hit high threshold)
- Input gain: `12dB` → `18dB` (boost quiet desk mic signal)
- Silence duration: `3s` → `2s` (faster turn-taking with cleaner VAD)

### Added
- `OPENCODE_AUDIO_DEVICE` env var — select PulseAudio source or ALSA device
- `OPENCODE_MIC_GAIN` env var — input gain in dB (default 18)
- `OPENCODE_VAD_THRESHOLD` env var — silence threshold % (default 4)
- `OPENCODE_VAD_SILENCE` env var — silence duration in seconds (default 2.0)
- Audio filtering: `highpass 80Hz` + `lowpass 7500Hz` before gain (reduces noise-induced hallucinations)
- `CHANGELOG.md` — this file

### Removed
- Hardcoded `SILENCE_DURATION`, `SILENCE_THRESHOLD`, `MIC_GAIN` constants — replaced by env vars
