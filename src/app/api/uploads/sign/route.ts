import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, schema } from "@/db";
import { presignPut, publicUrl } from "@/lib/storage";
import { uploadProblem } from "@/lib/upload-limits";
import {
  claimUploadQuota,
  clientIpHash,
  dailyUploadLimit,
  demoUserId,
  extensionFor,
  releaseUploadQuota,
  titleFromFilename,
} from "@/lib/uploads";

const body = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(100),
  size: z.number().int(),
  durationMs: z.number().nonnegative().nullable().optional(), // read by the browser from media metadata
});

/** Step 1 of an upload: checks limits, creates the meeting row, and returns a presigned PUT for the browser. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload request" }, { status: 400 });
  const { filename, contentType, size, durationMs } = parsed.data;

  const problem = uploadProblem({ size, type: contentType, durationMs });
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const ownerId = await demoUserId();
  if (!ownerId) return Response.json({ error: "The app hasn't been seeded yet" }, { status: 503 });

  const ipHash = clientIpHash(req.headers);
  if (!(await claimUploadQuota(ipHash))) {
    const n = dailyUploadLimit();
    return Response.json(
      { error: `You've reached the limit of ${n} upload${n === 1 ? "" : "s"} per day. Try again tomorrow.` },
      { status: 429 },
    );
  }

  const id = randomUUID();
  const mediaKey = `uploads/${id}/media.${extensionFor(filename, contentType)}`;
  try {
    const uploadUrl = await presignPut(mediaKey, contentType, size);
    await db()
      .insert(schema.meetings)
      .values({
        id,
        ownerId,
        title: titleFromFilename(filename),
        durationMs: durationMs ? Math.round(durationMs) : null,
        mediaKey,
        mediaUrl: publicUrl(mediaKey),
        mediaKind: contentType.startsWith("audio/") ? "audio" : "video",
        status: "uploaded",
        source: "upload",
        uploaderIpHash: ipHash,
      });
    return Response.json({ meetingId: id, uploadUrl, headers: { "Content-Type": contentType } });
  } catch (e) {
    console.error("upload sign failed", e);
    await releaseUploadQuota(ipHash).catch(() => {});
    return Response.json({ error: "Couldn't start the upload. Please try again." }, { status: 500 });
  }
}
