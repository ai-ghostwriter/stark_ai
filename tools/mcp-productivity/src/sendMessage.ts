import type { OpenTarget, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const sendMessageSchema = {
  type: "object",
  properties: {
    receiver: { type: "string" },
    message_text: { type: "string" },
    platform: { type: "string" },
    confirm: { type: "boolean", description: "Reserved. Auto-send is intentionally unsupported even when true." },
  },
  required: ["receiver", "message_text"],
};

function platformTarget(platform: string, receiver: string, message: string): string {
  const key = platform.toLowerCase();
  if (key.includes("whatsapp") || key === "wp") return `https://wa.me/?text=${encodeURIComponent(message)}`;
  if (key.includes("telegram") || key === "tg") return "tg://msg";
  if (key.includes("instagram") || key === "ig") return "https://www.instagram.com/direct/new/";
  if (key.includes("messenger") || key.includes("facebook")) return "https://www.messenger.com/";
  if (key.includes("discord")) return "discord://";
  if (key.includes("signal")) return "sgnl://";
  return platform || receiver;
}

export function createSendMessage(deps: { open: OpenTarget }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const receiver = String(args.receiver ?? "").trim();
    const messageText = String(args.message_text ?? "").trim();
    const platform = String(args.platform ?? "whatsapp").trim();
    if (!receiver) return failure("MISSING_RECEIVER", "Please specify a recipient.");
    if (!messageText) return failure("MISSING_MESSAGE", "Please specify message content.");
    if (args.confirm === true) {
      return failure("AUTO_SEND_UNSUPPORTED", "Auto-send is not supported by this MCP tool. Draft the message and let the user send it.");
    }
    try {
      const target = platformTarget(platform, receiver, messageText);
      await deps.open(target);
      return success({ status: "drafted", sent: false, platform, receiver, message_text: messageText, opened: target, note: "Safe subset: target app opened, no recipient automation and no auto-send." });
    } catch (error) {
      return failure("OPEN_TARGET_FAILED", "Could not open target messaging app.", errorMessage(error));
    }
  };
}
