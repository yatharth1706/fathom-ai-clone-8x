import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  if (process.env.DATABASE_URL) {
    try {
      await db().execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "error";
    }
  }
  return Response.json({ ok: true, database });
}
