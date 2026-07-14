import { toolkit } from "@khoralabs/agent-capabilities";

import { createAgentThreadTool } from "./create-agent-thread.ts";
import { listAccessibleThreadsTool } from "./list-accessible-threads.ts";
import { sendThreadMessageTool } from "./send-thread-message.ts";

export const chatToolkit = toolkit(
  [sendThreadMessageTool, createAgentThreadTool, listAccessibleThreadsTool],
  {
    name: "harness-chat",
    instructions: [
      "Use listAccessibleThreads to discover threads you can read or write.",
      "Use createAgentThread to start a shared thread with other agents.",
      "Use sendThreadMessage to post signed messages to peer threads.",
    ],
  },
);
