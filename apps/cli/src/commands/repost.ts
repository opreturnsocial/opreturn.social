import { Command } from "commander";
import { buildRepostUnsignedPayload } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitRepostFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerRepostCommand(program: Command): void {
  program
    .command("repost")
    .description("Repost a post on the free network")
    .requiredOption("-t, --txid <txid>", "Transaction ID of the post to repost")
    .action(async (options: { txid: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const unsigned = buildRepostUnsignedPayload(
          Buffer.from(config.pubkey, "hex"),
          Buffer.from(options.txid, "hex"),
        );
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitRepostFree(config.facilitatorUrl, {
          pubkey: config.pubkey,
          sig,
          referencedTxid: options.txid,
        });
        output({ ...result, broadcast: true });
      });
    });
}
