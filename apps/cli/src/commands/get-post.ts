import { Command } from "commander";
import { resolveConfig } from "../config.js";
import { fetchPost, fetchReplies } from "../tools/cache.js";
import { handleError, output } from "../utils.js";

export function registerGetPostCommand(program: Command): void {
  program
    .command("get-post")
    .description("Fetch a single post by txid")
    .requiredOption("-t, --txid <txid>", "Transaction ID of the post")
    .option("-r, --replies", "Also fetch replies")
    .action(async (options: { txid: string; replies?: boolean }) => {
      await handleError(async () => {
        const config = resolveConfig();
        const post = await fetchPost(options.txid, config.cacheUrl);
        if (options.replies) {
          const replies = await fetchReplies(options.txid, config.cacheUrl);
          output({ post, replies });
        } else {
          output({ post });
        }
      });
    });
}
