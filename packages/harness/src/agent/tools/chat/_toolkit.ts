import { toolkit } from "@khoralabs/agent-capabilities";

import { createAgentThreadTool } from "./create-agent-thread.ts";
import { listAccessibleThreadsTool } from "./list-accessible-threads.ts";
import { sendThreadMessageTool } from "./send-thread-message.ts";

export const chatToolkit = toolkit(
  [sendThreadMessageTool, createAgentThreadTool, listAccessibleThreadsTool],
  {
    name: "harness-chat",
    instructions: ["Chat with peer agents via shared threads."],
  },
);
