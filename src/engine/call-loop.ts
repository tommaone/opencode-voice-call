import { startRecording, stopRecording, forceKill, cleanup } from "./recorder"
import { transcribe } from "./transcriber"

export type CallState = "idle" | "recording" | "transcribing" | "submitting"

export interface CallCallbacks {
  onStateChange: (state: CallState) => void
  onTranscript: (text: string) => void
  onError: (error: string) => void
  onUtteranceComplete: () => void
  submitText: (text: string) => Promise<void>
}

export class CallLoop {
  private active = false
  private callbacks: CallCallbacks
  private cooldownMs: number

  constructor(callbacks: CallCallbacks, cooldownMs: number = 0) {
    this.callbacks = callbacks
    this.cooldownMs = cooldownMs
  }

  isActive(): boolean {
    return this.active
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    this.callbacks.onStateChange("recording")
    this.loop()
  }

  stop(): void {
    this.active = false
    stopRecording()
    forceKill()
    cleanup()
    this.callbacks.onStateChange("idle")
  }

  private async loop(): Promise<void> {
    while (this.active) {
      try {
        this.callbacks.onStateChange("recording")
        cleanup()

        const wavFile = await startRecording()
        if (!this.active) return

        this.callbacks.onStateChange("transcribing")
        const result = await transcribe(wavFile)

        if (!this.active) return

        if (result.error) {
          this.callbacks.onError(result.error)
          continue
        }

        if (!result.text) {
          continue
        }

        this.callbacks.onStateChange("submitting")
        this.callbacks.onTranscript(result.text)
        await this.callbacks.submitText(result.text)
        this.callbacks.onUtteranceComplete()
        if (this.cooldownMs > 0) {
          await new Promise(r => setTimeout(r, this.cooldownMs))
        }
      } catch (err) {
        if (!this.active) return
        const msg = err instanceof Error ? err.message : String(err)
        this.callbacks.onError(msg)
      }
    }
  }
}
