import { Command } from "commander";
import { resolveConfig } from "../config.js";
import { handleError, output } from "../utils.js";

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Show current identity and server configuration")
    .action(async () => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        output({
          pubkey: config.pubkey,
          facilitatorUrl: config.facilitatorUrl,
          cacheUrl: config.cacheUrl,
        });
      });
    });
}
