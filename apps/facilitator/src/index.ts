import "dotenv/config";
import { createServer, initNotifications } from "./server.js";

const PORT = Number(process.env.FACILITATOR_PORT ?? 3002);

const app = createServer();

app.listen(PORT, () => {
  console.log(`[facilitator] Listening on http://localhost:${PORT}`);
  initNotifications().catch((err) =>
    console.error("[facilitator] initNotifications error:", err)
  );
});
