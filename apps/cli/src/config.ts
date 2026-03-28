import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface OrsConfig {
  privkey?: string;
  pubkey?: string;
  facilitatorUrl?: string;
  cacheUrl?: string;
}

export const DEFAULT_FACILITATOR_URL = "https://facilitator.opreturn.social";
export const DEFAULT_CACHE_URL = "https://cache.opreturn.social";

export function getConfigPath(): string {
  return join(homedir(), ".ors", "cli", "config.json");
}

export function readConfig(): OrsConfig {
  const configPath = getConfigPath();
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as OrsConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export function writeConfig(config: OrsConfig): void {
  const configPath = getConfigPath();
  const dir = join(homedir(), ".ors", "cli");
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export interface ResolvedConfig {
  privkey: string;
  pubkey: string;
  facilitatorUrl: string;
  cacheUrl: string;
}

export function resolveConfig(overrides?: Partial<OrsConfig>): ResolvedConfig {
  const file = readConfig();
  return {
    privkey: overrides?.privkey ?? process.env.ORS_PRIVKEY ?? file.privkey ?? "",
    pubkey: overrides?.pubkey ?? process.env.ORS_PUBKEY ?? file.pubkey ?? "",
    facilitatorUrl:
      overrides?.facilitatorUrl ??
      process.env.ORS_FACILITATOR_URL ??
      file.facilitatorUrl ??
      DEFAULT_FACILITATOR_URL,
    cacheUrl:
      overrides?.cacheUrl ??
      process.env.ORS_CACHE_URL ??
      file.cacheUrl ??
      DEFAULT_CACHE_URL,
  };
}
