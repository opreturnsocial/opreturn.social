import { Command } from "commander";
import { resolveConfig } from "../config.js";
import { sponsorTransaction } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerSponsorCommand(program: Command): void {
  program
    .command("sponsor")
    .description(
      "Sponsor a free network transaction for mainnet broadcast.\n" +
        "Returns a Lightning invoice - once paid, the facilitator will broadcast the mainnet bitcoin transaction for the given free network txid.",
    )
    .requiredOption("-t, --txid <txid>", "Free network transaction ID to sponsor")
    .action(async (options: { txid: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        const result = await sponsorTransaction(config.facilitatorUrl, options.txid);
        output(result);
      });
    });
}
