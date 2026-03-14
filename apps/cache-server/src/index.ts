import "dotenv/config";
import { createServer } from "./server.js";
import { startScanner } from "./scanner.js";
import { prisma } from "./db.js";

const PORT = Number(process.env.CACHE_SERVER_PORT ?? 3001);

async function main() {
  // Ensure DB is connected
  await prisma.$connect();

  const app = createServer();

  app.listen(PORT, () => {
    console.log(`[cache-server] Listening on http://localhost:${PORT}`);
  });

  startScanner();
}

main().catch((err) => {
  console.error("[cache-server] Fatal error:", err);
  process.exit(1);
});
