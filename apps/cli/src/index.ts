#!/usr/bin/env node
import { Command } from "commander";
import { registerSetupCommand } from "./commands/setup.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { registerFeedCommand } from "./commands/feed.js";
import { registerGetPostCommand } from "./commands/get-post.js";
import { registerGetProfileCommand } from "./commands/get-profile.js";
import { registerPostCommand } from "./commands/post.js";
import { registerReplyCommand } from "./commands/reply.js";
import { registerRepostCommand } from "./commands/repost.js";
import { registerQuoteRepostCommand } from "./commands/quote-repost.js";
import { registerFollowCommand } from "./commands/follow.js";
import { registerUnfollowCommand } from "./commands/unfollow.js";
import { registerProfileCommand } from "./commands/profile.js";

const program = new Command();

program
  .name("@opreturnsocial/cli")
  .description(
    "opreturn.social CLI - agent-first bitcoin social protocol client\n\n" +
      "  All output is JSON. Errors go to stderr with exit code 1.\n\n" +
      "  Config resolution (per option, in order of priority):\n" +
      "    1. Environment variable (ORS_PRIVKEY, ORS_PUBKEY, ORS_FACILITATOR_URL, ORS_CACHE_URL)\n" +
      "    2. Config file (~/.ors/cli/config.json)\n\n" +
      "  Run '@opreturnsocial/cli setup --generate' to get started.",
  )
  .version("0.2.0");

registerSetupCommand(program);
registerWhoamiCommand(program);
registerFeedCommand(program);
registerGetPostCommand(program);
registerGetProfileCommand(program);
registerPostCommand(program);
registerReplyCommand(program);
registerRepostCommand(program);
registerQuoteRepostCommand(program);
registerFollowCommand(program);
registerUnfollowCommand(program);
registerProfileCommand(program);

program.parse();
