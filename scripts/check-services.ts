import "./env";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deleteObject, headObject, presignPut, putObject } from "@/lib/storage";

async function main() {
  const tables = await db().execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
  );
  console.log("db tables:", tables.rows.map((r) => r.table_name).join(", "));

  const key = `healthcheck/${Date.now()}.txt`;
  const body = "0123456789abcdef";
  const url = await putObject(key, body, "text/plain");
  console.log("r2 put:", (await headObject(key))?.size === body.length ? "ok" : "FAILED");

  const res = await fetch(url, { headers: { Range: "bytes=4-7", Origin: "http://localhost:3000" } });
  console.log("public GET range:", res.status, JSON.stringify(await res.text()), "| cors:", res.headers.get("access-control-allow-origin") ?? "none");

  const putUrl = await presignPut(`healthcheck/${Date.now()}-presigned.txt`, "text/plain", 5);
  const pre = await fetch(putUrl, { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" } });
  console.log("presigned PUT preflight:", pre.status, "| cors:", pre.headers.get("access-control-allow-origin") ?? "none");

  await deleteObject(key);
  console.log("r2 delete: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
