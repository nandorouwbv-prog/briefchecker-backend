import { app } from "../src/app.js";

// Express handles JSON parsing (512kb limit in src/app.ts).
export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
