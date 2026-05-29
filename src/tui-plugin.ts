import { CallLoop } from "./engine/call-loop"
import { forceKill, cleanup, cleanAllTempFiles } from "./engine/recorder"

let callLoop: CallLoop | null = null
let toastFn: (msg: string, variant?: string) => void = () => {}
let clientApi: any = null
let pendingPrompt: any = null
let pollAbort: AbortController | null = null
let callActive = false

async function startPromptWatcher(client: any) {
  while (callActive) {
    try {
      pollAbort = new AbortController()
      const controlResult = await client.tui.control.next({ signal: pollAbort.signal }).catch(() => null)
      if (!callActive) break
      if (controlResult?.data) {
        pendingPrompt = { type: "prompt", ...controlResult.data }
        toastFn("Interactive prompt waiting — speak your response", "info")
      }
    } catch {
      if (!callActive) break
      await new Promise(r => setTimeout(r, 500))
    }
  }
}

function stopPromptWatcher() {
  if (pollAbort) {
    pollAbort.abort()
    pollAbort = null
  }
  pendingPrompt = null
}

function normalizeResponse(text: string): string {
  const t = text.trim()
  if (/\bapprov/i.test(t)) return "allow"
  if (/\b(yes|ok|okay|fine|sure|yep|yeah)\b/i.test(t)) return "yes"
  if (/\b(no|nope|deny|reject|cancel|stop|nah)\b/i.test(t)) return "no"
  return text
}

function permissionMode(text: string): "once" | "always" | "reject" | null {
  const t = text.trim()
  if (/\bapprov\S*\s+(all|always)\b/i.test(t)) return "always"
  if (/\b(approv|yes|ok|okay|fine|sure|yep|yeah|allow)\b/i.test(t)) return "once"
  if (/\b(no|nope|deny|reject|cancel|stop|nah)\b/i.test(t)) return "reject"
  return null
}

/**
 * Get the most recently updated session ID.
 * Looks up fresh on every call — follows session switches automatically.
 */
async function getActiveSessionId(client: any): Promise<string | null> {
  try {
    const sessions = await client.session.list()
    if (!sessions || sessions.length === 0) return null
    const sorted = [...sessions].sort(
      (a: any, b: any) => (b.time?.updated || 0) - (a.time?.updated || 0)
    )
    return sorted[0].id
  } catch {
    return null
  }
}

async function submitViaSdk(client: any, text: string): Promise<void> {
  try {
    // Handle pending permission/interactive prompts first
    const prompt = pendingPrompt
    if (prompt) {
      pendingPrompt = null
      const answer = normalizeResponse(text)
      if (prompt.type === "permission") {
        const mode = permissionMode(text)
        if (mode) {
          await client.postSessionIdPermissionsPermissionId({
            path: { id: prompt.sessionID, permissionID: prompt.permissionId },
            body: { response: mode },
          })
          toastFn(mode === "always" ? "Auto-approve set" : mode === "once" ? "Approved" : "Rejected", "success")
        }
      } else {
        toastFn("Responding to prompt", "info")
        await client.tui.control.response({ body: answer })
      }
      return
    }

    // --- Normal voice submission ---
    // Look up the most recently updated session — follows TUI switches
    const sid = await getActiveSessionId(client)
    if (!sid) {
      toastFn("No session open — use /sessions", "warning")
      return
    }

    // Interrupt any current AI response so the new message goes through immediately
    try {
      await client.session.abort({ path: { id: sid } })
    } catch {
      // Session may not be busy — fine, proceed
    }

    // Submit fire-and-forget — returns immediately, no "Sending..." block.
    // The abort above already interrupted the AI.
    await client.session.promptAsync({
      path: { id: sid },
      body: { parts: [{ type: "text", text }] },
    })
  } catch (err: any) {
    toastFn(`Submit failed: ${err.message}`, "error")
  }
}

export default {
  id: "opencode-voice-call",

  tui: async (api: any, _options?: any) => {
    // Clean up orphaned sox processes and temp files from a previous session
    // that was interrupted by an opencode restart/crash.
    forceKill()
    cleanup()
    cleanAllTempFiles()

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

          // Verify at least one session exists before starting
          const sid = await getActiveSessionId(clientApi)
          if (!sid) {
            toast("Open a session first (/sessions)", "warning")
            return
          }

          callActive = true
          startPromptWatcher(clientApi)

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
          callActive = false
          stopPromptWatcher()
          callLoop.stop()
          callLoop = null
          toast("Call ended", "info")
        },
      },
    ])
  },
}
