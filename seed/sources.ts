// Seed media sources. Raw files live in media-work/raw/ (gitignored); prepared media is uploaded to R2 under seed/<slug>/.

export type SeedSource = {
  slug: string;
  title: string;
  startedAt: string; // ISO
  kind: "video" | "audio";
  rawFile: string; // path under media-work/raw/
  sourceUrl: string;
  license: string;
  attribution: string;
  asr: "assemblyai" | "ami";
  speakersExpected?: number;
};

export const SEED_SOURCES: SeedSource[] = [
  {
    slug: "board-seats-feedback-2021-02-20",
    title: "Community Board seats — call for feedback",
    startedAt: "2021-02-20T15:00:00Z",
    kind: "video",
    rawFile: "board-seats-2021-02-20.webm",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Call_for_feedback_Community_Board_seats_2021-02-20_-_First_meeting.webm",
    license: "CC BY-SA 3.0",
    attribution: "Wikimedia Foundation, via Wikimedia Commons (CC BY-SA 3.0). Transcoded to H.264.",
    asr: "assemblyai",
  },
];
