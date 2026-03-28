import { Command } from "commander";
import { buildProfileUpdateUnsignedPayload, PROPERTY_NAME, PROPERTY_BIO, PROPERTY_AVATAR_URL } from "@opreturnsocial/protocol";
import { resolveConfig } from "../config.js";
import { signV1Payload } from "../tools/signing.js";
import { submitProfileUpdateFree } from "../tools/facilitator.js";
import { handleError, output } from "../utils.js";

export function registerProfileCommand(program: Command): void {
  program
    .command("profile")
    .description("Update profile on the free network (provide exactly one field)")
    .option("--name <text>", "Set display name")
    .option("--bio <text>", "Set bio")
    .option("--avatar <url>", "Set avatar URL")
    .action(async (options: { name?: string; bio?: string; avatar?: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }

        const fields = [
          options.name !== undefined && { propertyKind: PROPERTY_NAME, value: options.name },
          options.bio !== undefined && { propertyKind: PROPERTY_BIO, value: options.bio },
          options.avatar !== undefined && { propertyKind: PROPERTY_AVATAR_URL, value: options.avatar },
        ].filter(Boolean) as { propertyKind: number; value: string }[];

        if (fields.length === 0) {
          throw new Error("Provide at least one field: --name, --bio, or --avatar");
        }
        if (fields.length > 1) {
          throw new Error("Provide exactly one field per command (--name, --bio, or --avatar)");
        }

        const { propertyKind, value } = fields[0];
        const unsigned = buildProfileUpdateUnsignedPayload(
          propertyKind,
          value,
          Buffer.from(config.pubkey, "hex"),
        );
        const sig = signV1Payload(unsigned, config.privkey);
        const result = await submitProfileUpdateFree(config.facilitatorUrl, {
          propertyKind,
          value,
          pubkey: config.pubkey,
          sig,
        });
        output({ ...result, broadcast: true });
      });
    });
}
