import { spawn, execSync, type ChildProcess } from "child_process"
import { unlinkSync, readdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let soxProc: ChildProcess | null = null
let currentFile: string | null = null
let stderrBuf = ""

// Headset-friendly defaults — close mic, no boost needed
const SILENCE_DURATION = parseFloat(process.env.OPENCODE_VAD_SILENCE || "1.5")
const MAX_DURATION = 300
const SILENCE_THRESHOLD = `${parseFloat(process.env.OPENCODE_VAD_THRESHOLD || "3").toFixed(1)}%`
const AUDIO_DEVICE = process.env.OPENCODE_AUDIO_DEVICE || ""

function getTempFile(): string {
  return join(tmpdir(), `opencode-voice-${Date.now()}.wav`)
}

function buildSoxArgs(file: string, silenceSec: number): string[] {
  const args: string[] = ["-q"]

  if (AUDIO_DEVICE) {
    if (AUDIO_DEVICE.includes(":")) {
      args.push("-t", "alsa", AUDIO_DEVICE)
    } else {
      args.push("-t", "pulseaudio", AUDIO_DEVICE)
    }
  }

  args.push(
    "-r", "16000",
    "-c", "1",
    "-b", "16",
    file,
    "highpass", "80",
    "silence",
    "1", "0.1", SILENCE_THRESHOLD,
    "1", `${silenceSec.toFixed(1)}`, SILENCE_THRESHOLD,
  )

  return args
}

export function isRecording(): boolean {
  return soxProc !== null
}

export function startRecording(
  opts?: { silenceDuration?: number; maxDuration?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (soxProc) {
      reject(new Error("Already recording"))
      return
    }

    const silence = opts?.silenceDuration ?? SILENCE_DURATION
    const maxSec = opts?.maxDuration ?? MAX_DURATION
    const file = getTempFile()
    currentFile = file
    stderrBuf = ""

    const args = buildSoxArgs(file, silence)
    const timeoutArgs = [maxSec.toString(), "rec", ...args]

    const recorder = spawn("timeout", timeoutArgs)

    soxProc = recorder
    recorder.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString()
    })

    recorder.on("error", () => {
      soxProc = null
      currentFile = null
      reject(
        new Error(
          "sox not found. Install it:\n" +
          "  Ubuntu/Debian: sudo apt install sox\n" +
          "  macOS: brew install sox\n" +
          "  Fedora: sudo dnf install sox\n" +
          "  Arch: sudo pacman -S sox"
        )
      )
    })

    recorder.on("close", (code) => {
      soxProc = null
      if (code === 0 || code === 124) {
        resolve(file)
      } else {
        const err = stderrBuf.trim().split("\n").pop() || `sox exited with code ${code}`
        reject(new Error(err))
      }
    })
  })
}

export function stopRecording(): void {
  if (soxProc) {
    try {
      soxProc.kill("SIGINT")
    } catch {}
    soxProc = null
  }
}

export function forceKill(): void {
  if (soxProc) {
    try {
      process.kill(soxProc.pid!, "SIGKILL")
    } catch {}
    soxProc = null
  }
  try {
    execSync("pkill -9 -f 'opencode-voice' 2>/dev/null", { stdio: "ignore" })
  } catch {}
}

export function cleanup(): void {
  if (currentFile) {
    try { unlinkSync(currentFile) } catch {}
    currentFile = null
  }
}

export function cleanAllTempFiles(): void {
  try {
    const tmpDir = tmpdir()
    const files = readdirSync(tmpDir)
    for (const f of files) {
      if (f.startsWith("opencode-voice-") && f.endsWith(".wav")) {
        try { unlinkSync(join(tmpDir, f)) } catch {}
      }
    }
  } catch {}
}
