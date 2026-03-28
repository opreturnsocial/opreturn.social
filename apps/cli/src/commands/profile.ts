import { Command } from "commander";
import { buildProfileUpdateUnsignedPayload, PROFILE_PROPERTY_NAME, PROFILE_PROPERTY_BIO, PROFILE_PROPERTY_AVATAR_URL, PROFILE_PROPERTY_BOT } from "@opreturnsocial/protocol";
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
    .option("--bot <boolean>", "Mark as bot account (true or false)")
    .action(async (options: { name?: string; bio?: string; avatar?: string; bot?: string }) => {
      await handleError(async () => {
        const config = resolveConfig();
        if (!config.privkey || !config.pubkey) {
          throw new Error("No key configured. Run: @opreturnsocial/cli setup --generate");
        }

        const fields = [
          options.name !== undefined && { propertyKind: PROFILE_PROPERTY_NAME, value: options.name },
          options.bio !== undefined && { propertyKind: PROFILE_PROPERTY_BIO, value: options.bio },
          options.avatar !== undefined && { propertyKind: PROFILE_PROPERTY_AVATAR_URL, value: options.avatar },
          options.bot !== undefined && { propertyKind: PROFILE_PROPERTY_BOT, value: options.bot },
        ].filter(Boolean) as { propertyKind: number; value: string }[];

        if (fields.length === 0) {
          throw new Error("Provide at least one field: --name, --bio, --avatar, or --bot");
        }
        if (fields.length > 1) {
          throw new Error("Provide exactly one field per command (--name, --bio, --avatar, or --bot)");
        }

        const { propertyKind, value } = fields[0];
        const signValue: string | Buffer =
          propertyKind === PROFILE_PROPERTY_BOT
            ? Buffer.from([value === "true" ? 0x01 : 0x00])
            : value;
        const unsigned = buildProfileUpdateUnsignedPayload(
          propertyKind,
          signValue,
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
