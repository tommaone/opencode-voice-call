import { spawn, execSync } from "child_process"
import { existsSync, statSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const MODEL_NAME = "base.en"

export interface TranscribeResult {
  text?: string
  error?: string
}

function getModelPath(): string {
  const home = homedir()
  const candidates = [
    join(home, ".local", "share", "whisper-cpp", `ggml-${MODEL_NAME}.bin`),
    join(home, ".local", "share", "whisper-cpp", `ggml-${MODEL_NAME}-q5_0.bin`),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

function findWhisperBin(): string {
  try {
    return execSync("which whisper-cli", { encoding: "utf-8", timeout: 3000 }).trim()
  } catch {
    const home = homedir()
    const candidates = [
      "/usr/local/bin/whisper-cli",
      "/usr/bin/whisper-cli",
      join(home, ".local", "bin", "whisper-cli"),
      join(home, "go", "bin", "whisper-cli"),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return "whisper-cli"
  }
}

export async function transcribe(wavFile: string): Promise<TranscribeResult> {
  if (!existsSync(wavFile)) {
    return { error: "Recording file not found" }
  }

  const size = statSync(wavFile).size
  if (size <= 44) {
    return { error: "Recording is empty — no audio captured" }
  }

  const modelPath = getModelPath()
  if (!existsSync(modelPath)) {
    return {
      error: `Whisper model not found at ${modelPath}. Download it:\n` +
        `mkdir -p ${join(homedir(), ".local", "share", "whisper-cpp")}\n` +
        `curl -L -o "${modelPath}" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL_NAME}.bin`
    }
  }

  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""

    const proc = spawn("whisper-cli", [
      "-m", modelPath,
      "-f", wavFile,
      "-np",
      "-nt",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      resolve({ error: "Transcription timed out (60s)" })
    }, 60000)

    proc.on("error", (err) => {
      clearTimeout(timer)
      const msg = err.message.includes("spawn") && (err as any).code === "ENOENT"
        ? "whisper-cli not found. Install it from https://github.com/ggerganov/whisper.cpp"
        : `Transcription failed: ${err.message}`
      resolve({ error: msg })
    })

    proc.on("exit", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const errLine = stderr.trim().split("\n").pop()
        resolve({ error: errLine || `whisper-cli exited (code ${code})` })
        return
      }
      const text = stdout
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\s+/g, " ")
        .trim()
      resolve({ text: text || undefined })
    })
  })
}
