import "./env";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { putObject } from "@/lib/storage";
import { SEED_SOURCES } from "../seed/sources";

// Usage: pnpm prepare-media [slug...]   (no args = all sources)
// Transcodes each raw file to web-friendly media, extracts a poster frame and a 16 kHz mono MP3 for ASR,
// then uploads all three to R2 under seed/<slug>/.

const RAW = "media-work/raw";
const OUT = "media-work/out";

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

async function main() {
  const only = process.argv.slice(2);
  const sources = SEED_SOURCES.filter((s) => only.length === 0 || only.includes(s.slug));

  for (const s of sources) {
    const raw = path.join(RAW, s.rawFile);
    if (!existsSync(raw)) {
      console.warn(`skip ${s.slug}: missing ${raw}`);
      continue;
    }
    const dir = path.join(OUT, s.slug);
    mkdirSync(dir, { recursive: true });

    const media = path.join(dir, s.kind === "video" ? "media.mp4" : "media.m4a");
    const poster = path.join(dir, "poster.jpg");
    const asrAudio = path.join(dir, "asr.mp3");

    console.log(`[${s.slug}] transcoding`);
    if (s.kind === "video") {
      // H.264/AAC plays everywhere; faststart puts the index up front so seeking is instant.
      ffmpeg(["-i", raw, "-vf", "scale=-2:'min(540,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", media]);
      ffmpeg(["-ss", "60", "-i", raw, "-frames:v", "1", "-vf", "scale=-2:360", "-q:v", "4", poster]);
    } else {
      ffmpeg(["-i", raw, "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", media]);
    }
    ffmpeg(["-i", raw, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", asrAudio]);

    const mb = (f: string) => (statSync(f).size / 1e6).toFixed(1) + " MB";
    console.log(`[${s.slug}] media ${mb(media)}, asr ${mb(asrAudio)}; uploading`);

    const key = (f: string) => `seed/${s.slug}/${path.basename(f)}`;
    await putObject(key(media), createReadStream(media), s.kind === "video" ? "video/mp4" : "audio/mp4");
    await putObject(key(asrAudio), createReadStream(asrAudio), "audio/mpeg");
    if (s.kind === "video") await putObject(key(poster), createReadStream(poster), "image/jpeg");
    console.log(`[${s.slug}] done`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
