import { CallLoop } from "./engine/call-loop"

let callLoop: CallLoop | null = null
let toastFn: (msg: string, variant?: string) => void = () => {}
let clientApi: any = null

async function getSessionId(client: any): Promise<string | null> {
  try {
    const result = await client.session.list()
    if (!result.data?.length) return null
    const sessions = result.data.sort(
      (a: any, b: any) => (b.time?.updated || 0) - (a.time?.updated || 0)
    )
    return sessions[0]?.id || null
  } catch {
    return null
  }
}

async function pollForPrompt(client: any, timeoutMs: number): Promise<any> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const result = await client.tui.control.next({ signal: controller.signal })
    clearTimeout(timer)
    return result.data
  } catch {
    return null
  }
}

async function submitViaSdk(client: any, text: string): Promise<void> {
  const sessionId = await getSessionId(client)
  if (!sessionId) {
    toastFn("No active opencode session found", "error")
    return
  }
  try {
    const prompt = await pollForPrompt(client, 200)
    if (prompt) {
      toastFn("Interactive prompt detected — responding", "info")
      await client.tui.control.response({ body: text })
      const followUp = await pollForPrompt(client, 2000)
      if (followUp) {
        toastFn("Another prompt waiting — keep speaking", "info")
      }
      return
    }
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text }],
      },
    })
  } catch (err: any) {
    toastFn(`Submit failed: ${err.message}`, "error")
  }
}

export default {
  id: "opencode-voice-call",

  tui: async (api: any, _options?: any) => {
    clientApi = api.client

    const toast = (message: string, variant: string = "info") => {
      api.ui.toast({ message, variant, duration: 3000 })
    }
    toastFn = toast

    function updateStatus(state: string) {
      switch (state) {
        case "idle":
          toast("Call ended", "info")
          break
        default:
          break
      }
    }

    api.command.register(() => [
      {
        title: "Voice Call: start",
        value: "voice-call.start",
        description: "Start continuous voice recording and auto-submit",
        slash: { name: "call" },
        onSelect: async () => {
          if (callLoop?.isActive()) {
            toast("Call already active. Use /hang to end.", "warning")
            return
          }

          callLoop = new CallLoop({
            onStateChange: updateStatus,
            onTranscript: (text: string) => {
              const preview = text.length > 60 ? text.slice(0, 60) + "..." : text
              toast(`Transcribed: "${preview}"`)
            },
            onError: (error: string) => {
              toast(`Voice call error: ${error}`, "error")
            },
            onUtteranceComplete: () => {},
            submitText: async (text: string) => {
              await submitViaSdk(clientApi, text)
            },
          })

          callLoop.start()
          toast("Call active — speak now", "success")
        },
      },
      {
        title: "Voice Call: hang up",
        value: "voice-call.stop",
        description: "End active voice call",
        slash: { name: "hang" },
        onSelect: () => {
          if (!callLoop?.isActive()) {
            toast("No active call", "warning")
            return
          }
          callLoop.stop()
          callLoop = null
          toast("Call ended", "info")
        },
      },
    ])
  },
}
