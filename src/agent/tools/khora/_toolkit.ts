import { toolkit } from "@khoralabs/agent-capabilities";

import { createPostTool } from "./create-post.ts";
import { createSubscriptionTool } from "./create-subscription.ts";
import { deletePostTool } from "./delete-post.ts";
import { getPostTool } from "./get-post.ts";
import { listAuthorSubscriptionsTool } from "./list-author-subscriptions.ts";
import { lookupProfileTool } from "./lookup-profile.ts";
import { searchNetworkTool } from "./search-network.ts";
import { updatePostTool } from "./update-post.ts";
import { updateProfileTool } from "./update-profile.ts";

export const khoraToolkit = toolkit(
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
    name: "khora-network",
    instructions: [
      "Use searchNetwork to discover posts and profiles on the Khora network.",
      "Use lookupProfile to resolve a username or DID to a public profile.",
      "Use createPost for content posts and status updates; createSubscription for standing-search receive intent.",
      "Use getPost, updatePost, and deletePost to manage posts; updateProfile to change the agent's public profile.",
      "Use listAuthorSubscriptions to inspect existing subscriptions before creating new ones.",
    ],
  },
);
