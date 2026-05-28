import * as vscode from "vscode"
import { execSync } from "child_process"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/client"
import { CallLoop, type CallState } from "./engine/call-loop"

let statusBarItem: vscode.StatusBarItem
let callLoop: CallLoop | null = null
let callActive = false
let client: OpencodeClient | null = null
let sessionId: string | null = null

export function activate(context: vscode.ExtensionContext) {
  const port = discoverOpencodePort()
  if (port) {
    client = createOpencodeClient({ baseUrl: `http://localhost:${port}` })
  }

  statusBarItem = vscode.window.createStatusBarItem(
    "opencode-voice-call",
    vscode.StatusBarAlignment.Left,
    0
  )
  statusBarItem.text = "$(mic) Call"
  statusBarItem.backgroundColor = undefined
  statusBarItem.command = "opencode-voice-call.toggle"
  statusBarItem.show()

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand("opencode-voice-call.toggle", toggleCall)
  )
}

export function deactivate() {
  stopCall()
  statusBarItem?.dispose()
}

function updateButton(state: CallState) {
  switch (state) {
    case "idle":
      statusBarItem.text = "$(mic) Call"
      statusBarItem.backgroundColor = undefined
      statusBarItem.tooltip = "Start voice call"
      break
    case "recording":
      statusBarItem.text = "$(mic) Listening..."
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
      statusBarItem.tooltip = "Listening — click to stop"
      break
    case "transcribing":
      statusBarItem.text = "$(sync~spin) Transcribing..."
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
      break
    case "submitting":
      statusBarItem.text = "$(send) Sending..."
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground")
      break
  }
}

function discoverOpencodePort(): number | null {
  try {
    const pids = execSync("pgrep -f 'opencode.*--port' | head -5", {
      encoding: "utf-8",
      timeout: 3000,
    })
      .trim()
      .split("\n")
      .filter(Boolean)

    for (const pid of pids) {
      try {
        const cmdline = execSync(
          `tr '\\0' ' ' < /proc/${pid}/cmdline 2>/dev/null`,
          { encoding: "utf-8", timeout: 1000 }
        )
        const match = cmdline.match(/--port\s+(\d+)/)
        if (match) return parseInt(match[1], 10)
      } catch {}
    }
  } catch {}
  return null
}

async function getSessionId(): Promise<string | null> {
  try {
    const result = await client!.session.list()
    const sessions = result.data?.sort(
      (a: any, b: any) => (b.time?.updated || 0) - (a.time?.updated || 0)
    )
    return sessions?.[0]?.id || null
  } catch {
    return null
  }
}

async function toggleCall() {
  if (callActive) {
    stopCall()
  } else {
    await startCall()
  }
}

async function startCall() {
  if (!client) {
    vscode.window.showWarningMessage("No opencode server found")
    return
  }

  sessionId = await getSessionId()
  if (!sessionId) {
    vscode.window.showWarningMessage("No active opencode session")
    return
  }

  callActive = true

  callLoop = new CallLoop({
    onStateChange: updateButton,
    onTranscript: () => {},
    onError: (err) => {
      vscode.window.showWarningMessage(`Voice call: ${err}`)
    },
    onUtteranceComplete: () => {},
    submitText: async (text) => {
      client!.session.prompt({
        path: { id: sessionId! },
        body: {
          parts: [{ type: "text", text }],
        },
      }).catch((err: any) => {
        vscode.window.showWarningMessage(`Submit failed: ${err.message}`)
      })
    },
  })

  callLoop.start()
}

function stopCall() {
  callActive = false
  if (callLoop) {
    callLoop.stop()
    callLoop = null
  }
  updateButton("idle")
}
