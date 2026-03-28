import { Command } from "commander";
import { buildQuoteRepostUnsignedPayload } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitQuoteRepostFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerQuoteRepostCommand(program: Command): void {
  program
    .command("quote-repost")
    .description("Quote-repost a post on the free network")
    .requiredOption("-c, --content <text>", "Quote content (max 277 bytes UTF-8)")
    .requiredOption("-t, --txid <txid>", "Transaction ID of the post to quote-repost")
    .action(async (options: { content: string; txid: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const unsigned = buildQuoteRepostUnsignedPayload(
          options.content,
          Buffer.from(config.pubkey, "hex"),
          Buffer.from(options.txid, "hex"),
        );
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitQuoteRepostFree(config.facilitatorUrl, {
          content: options.content,
          pubkey: config.pubkey,
          sig,
          referencedTxid: options.txid,
        });
        output({ ...result, broadcast: true });
      });
    });
}
