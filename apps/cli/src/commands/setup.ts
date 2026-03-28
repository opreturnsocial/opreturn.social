import { Command } from "commander";
import { schnorr } from "@noble/curves/secp256k1";
import { nip19 } from "nostr-tools";
import { readConfig, writeConfig, getConfigPath } from "../config.js";
import { derivePublicKey } from "../tools/signing.js";
import { handleError, output } from "../utils.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Configure the CLI (private key, server URLs)")
    .option("--generate", "Generate a new keypair")
    .option("--nsec <nsec_or_hex>", "Import a private key (nsec bech32 or 64-char hex)")
    .option("--facilitator-url <url>", "Override facilitator server URL")
    .option("--cache-url <url>", "Override cache server URL")
    .action(async (options: { generate?: boolean; nsec?: string; facilitatorUrl?: string; cacheUrl?: string }) => {
      await handleError(async () => {
        const config = readConfig();

        if (options.generate) {
          const privkeyBytes = schnorr.utils.randomPrivateKey();
          config.privkey = Buffer.from(privkeyBytes).toString("hex");
          config.pubkey = derivePublicKey(config.privkey);
        }

        if (options.nsec) {
          let privkeyHex: string;
          if (options.nsec.startsWith("nsec1")) {
            const decoded = nip19.decode(options.nsec);
            if (decoded.type !== "nsec") {
              throw new Error("Invalid nsec: expected a nostr private key (nsec1...)");
            }
            privkeyHex = Buffer.from(decoded.data as Uint8Array).toString("hex");
          } else if (/^[0-9a-f]{64}$/i.test(options.nsec)) {
            privkeyHex = options.nsec.toLowerCase();
          } else {
            throw new Error("Invalid key: expected nsec bech32 or 64-char hex private key");
          }
          config.privkey = privkeyHex;
          config.pubkey = derivePublicKey(privkeyHex);
        }

        if (options.facilitatorUrl) {
          config.facilitatorUrl = options.facilitatorUrl;
        }

        if (options.cacheUrl) {
          config.cacheUrl = options.cacheUrl;
        }

        writeConfig(config);
        output({ saved: true, pubkey: config.pubkey ?? null, configPath: getConfigPath() });
      });
    });
}
