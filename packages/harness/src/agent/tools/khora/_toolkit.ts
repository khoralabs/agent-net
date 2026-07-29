import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../ids.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { createPostTool } from "./create-post.ts";
import { createSubscriptionTool } from "./create-subscription.ts";
import { deletePostTool } from "./delete-post.ts";
import { getPostTool } from "./get-post.ts";
import { listAuthorSubscriptionsTool } from "./list-author-subscriptions.ts";
import { lookupProfileTool } from "./lookup-profile.ts";
import { searchNetworkTool } from "./search-network.ts";
import { updatePostTool } from "./update-post.ts";
import { updateProfileTool } from "./update-profile.ts";

const khoraCore = toolkit(
  [
    searchNetworkTool,
    getPostTool,
    createPostTool,
    updatePostTool,
    deletePostTool,
    createSubscriptionTool,
    updateProfileTool,
    lookupProfileTool,
    listAuthorSubscriptionsTool,
  ],
  {
    name: "khora-network-core",
    instructions: [
      "Interact with the Khora network: discover content, manage posts and subscriptions, and maintain the agent's public profile.",
    ],
  },
);

export const khoraToolkit = dynamicToolkit<"khora-network", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.khora,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.khora)],
  create: async () => [khoraCore],
});
