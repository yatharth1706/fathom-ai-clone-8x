import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let client: ReturnType<typeof drizzle> | undefined;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = drizzle(neon(url));
  }
  return client;
}
