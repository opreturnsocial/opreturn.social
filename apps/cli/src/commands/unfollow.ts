import { Command } from "commander";
import { buildFollowUnsignedPayload } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitFollowFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerUnfollowCommand(program: Command): void {
  program
    .command("unfollow")
    .description("Unfollow a pubkey on the free network")
    .requiredOption("-p, --pubkey <hex>", "Pubkey to unfollow (64-char hex)")
    .action(async (options: { pubkey: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const unsigned = buildFollowUnsignedPayload(
          Buffer.from(options.pubkey, "hex"),
          false,
          Buffer.from(config.pubkey, "hex"),
        );
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitFollowFree(config.facilitatorUrl, {
          targetPubkey: options.pubkey,
          isFollow: false,
          pubkey: config.pubkey,
          sig,
        });
        output({ ...result, broadcast: true });
      });
    });
}
