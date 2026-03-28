import { Command } from "commander";
import { resolveConfig } from "../config.js";
import { fetchProfileByPubkey } from "../tools/cache.js";
import { handleError, output } from "../utils.js";

export function registerGetProfileCommand(program: Command): void {
  program
    .command("get-profile")
    .description("Fetch a profile (defaults to own pubkey)")
    .option("-p, --pubkey <hex>", "Pubkey to look up (defaults to configured pubkey)")
    .action(async (options: { pubkey?: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        const pubkey = options.pubkey ?? config.pubkey;
        if (!pubkey) {
          throw new Error("No pubkey specified and no key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const profile = await fetchProfileByPubkey(pubkey, config.cacheUrl);
        if (!profile) {
          throw new Error(`Profile not found for pubkey: ${pubkey}`);
        }
        output(profile);
      });
    });
}
