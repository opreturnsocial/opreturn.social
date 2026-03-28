import { Command } from "commander";
import { buildUnsignedPayload } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitPostFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerPostCommand(program: Command): void {
  program
    .command("post")
    .description("Create a text note on the free network")
    .requiredOption("-c, --content <text>", "Post content (max 277 bytes UTF-8)")
    .action(async (options: { content: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }
        const unsigned = buildUnsignedPayload(options.content, Buffer.from(config.pubkey, "hex"));
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitPostFree(config.facilitatorUrl, {
          content: options.content,
          pubkey: config.pubkey,
          sig,
        });
        output({ ...result, broadcast: true });
      });
    });
}
