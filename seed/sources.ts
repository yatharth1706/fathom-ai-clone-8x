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
  speakersExpected?: number;
  speakerRange?: [number, number];
};

const civiwiki = (date: string, rawFile: string, archiveId: string): SeedSource => ({
  slug: `civiwiki-weekly-${date}`,
  title: `CiviWiki weekly sync — ${date}`,
  startedAt: `${date}T19:00:00Z`,
  kind: "video",
  rawFile,
  sourceUrl: `https://archive.org/details/${archiveId}`,
  license: "CC0 1.0",
  attribution: "CiviWiki open-source team, via the Internet Archive (CC0 public domain dedication).",
  speakerRange: [2, 8],
});

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
    speakerRange: [3, 12],
  },
  civiwiki("2018-05-28", "civiwiki-2018-05-28.mp4", "CiviWikiWeeklyMeeting20180528"),
  civiwiki("2018-05-14", "civiwiki-2018-05-14.mp4", "CiviWikiWeeklyMeeting20180514"),
  civiwiki("2018-02-19", "civiwiki-2018-02-19.mp4", "CiviWikiWeeklyMeeting20180219"),
  {
    slug: "editor-engagement-roundtable-2013-06-22",
    title: "Editor engagement roundtable",
    startedAt: "2013-06-22T17:00:00Z",
    kind: "video",
    rawFile: "engagement-roundtable-1-part-1.webm",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Engagement_Roundtable_1_-_Part_1.webm",
    license: "CC BY-SA 3.0",
    attribution:
      "Fabrice Florin and Erik Bernhardson for the Wikimedia Foundation, via Wikimedia Commons (CC BY-SA 3.0). Transcoded to H.264.",
    speakerRange: [3, 15],
  },
];
