// Side-effect import: load .env.local for standalone scripts (Next does this itself for the app).
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
