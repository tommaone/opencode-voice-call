import { spawn, execSync, type ChildProcess } from "child_process"
import { unlinkSync, renameSync, readdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let soxProc: ChildProcess | null = null
let currentFile: string | null = null
let stderrBuf = ""

const CHUNK_SECONDS = parseFloat(process.env.OPENCODE_CHUNK_SECONDS || "4")
const MIC_GAIN = parseFloat(process.env.OPENCODE_MIC_GAIN || "6")
const AUDIO_DEVICE = process.env.OPENCODE_AUDIO_DEVICE || ""

function getTempFile(): string {
  return join(tmpdir(), `opencode-voice-${Date.now()}.wav`)
}

/**
 * Build sox args for recording a fixed-duration raw chunk.
 * No amplitude VAD — whisper's model-based VAD handles speech detection.
 */
function buildSoxArgs(file: string): string[] {
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
    "-e", "signed-integer",
    file,
    "highpass", "80",
    "lowpass", "7500",
    "gain", `${MIC_GAIN.toFixed(0)}`,
  )

  return args
}

/**
 * Amplify a WAV file in-place to boost whisper accuracy.
 * Uses sox gain effect. Original file is replaced.
 */
export function amplifyFile(file: string, gainDb: number = 24): void {
  const tmp = file + ".amp"
  try {
    execSync(`sox "${file}" "${tmp}" gain ${gainDb.toFixed(0)}`, { timeout: 10000 })
    unlinkSync(file)
    renameSync(tmp, file)
  } catch {
    try { unlinkSync(tmp) } catch {}
  }
}

export function isRecording(): boolean {
  return soxProc !== null
}

export function startRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (soxProc) {
      reject(new Error("Already recording"))
      return
    }

    const file = getTempFile()
    currentFile = file
    stderrBuf = ""

    const args = buildSoxArgs(file)
    const timeoutArgs = [CHUNK_SECONDS.toFixed(0), "rec", ...args]
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
        // Amplify quiet recordings for whisper
        amplifyFile(file, 24)
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
