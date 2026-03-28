import { Command } from "commander";
import { resolveConfig } from "../config.js";
import { fetchFeed } from "../tools/cache.js";
import { handleError, output } from "../utils.js";

export function registerFeedCommand(program: Command): void {
  program
    .command("feed")
    .description("Fetch the feed")
    .option("-l, --limit <n>", "Number of items to fetch", parseInt, 20)
    .option("-o, --offset <n>", "Offset for pagination", parseInt, 0)
    .option("-p, --pubkey <hex>", "Filter by pubkey (profile feed)")
    .option("-v, --viewer <hex>", "Show following feed for this pubkey")
    .option("-a, --all", "Include activity (follows, profile updates)")
    .action(async (options: { limit: number; offset: number; pubkey?: string; viewer?: string; all?: boolean }) => {
      await handleError(async () => {
        const config = resolveConfig();
        const result = await fetchFeed(config.cacheUrl, {
          limit: options.limit,
          offset: options.offset,
          pubkey: options.pubkey,
          viewer: options.viewer,
          feedFilter: options.all ? "all" : "posts",
        });
        output(result);
      });
    });
}
