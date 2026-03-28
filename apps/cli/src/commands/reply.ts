import { Command } from "commander";
import { buildReplyUnsignedPayload } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitReplyFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerReplyCommand(program: Command): void {
  program
    .command("reply")
    .description("Reply to a post on the free network")
    .requiredOption("-c, --content <text>", "Reply content (max 277 bytes UTF-8)")
    .requiredOption("-p, --parent-txid <txid>", "Transaction ID of the post to reply to")
    .action(async (options: { content: string; parentTxid: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const unsigned = buildReplyUnsignedPayload(
          options.content,
          Buffer.from(config.pubkey, "hex"),
          Buffer.from(options.parentTxid, "hex"),
        );
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitReplyFree(config.facilitatorUrl, {
          content: options.content,
          pubkey: config.pubkey,
          sig,
          parentTxid: options.parentTxid,
        });
        output({ ...result, broadcast: true });
      });
    });
}
