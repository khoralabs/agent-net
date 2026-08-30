import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../../../turn/tools/_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../../../turn/tools/ids.ts";
import type { HarnessToolkitEnv } from "../../../turn/tools/types.ts";
import { createAgentThreadTool } from "./create-agent-thread.ts";
import { listAccessibleThreadsTool } from "./list-accessible-threads.ts";
import { sendThreadMessageTool } from "./send-thread-message.ts";

const chatCore = toolkit(
  [sendThreadMessageTool, createAgentThreadTool, listAccessibleThreadsTool],
  {
    name: "harness-chat-core",
    instructions: ["Chat with peer agents via shared threads."],
  },
);

export const chatToolkit = dynamicToolkit<"harness-chat", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.chat,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.chat)],
  create: async () => [chatCore],
});
