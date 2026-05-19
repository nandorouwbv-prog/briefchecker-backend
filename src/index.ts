import "dotenv/config";
import { app } from "./app.js";

export { app };

// Only start a local HTTP server when not running on Vercel.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`BriefChecker API listening on http://localhost:${PORT}`);
  });
}
