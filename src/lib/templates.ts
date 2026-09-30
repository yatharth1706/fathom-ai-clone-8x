import type { TemplateId } from "@/lib/providers/types";

// Summary templates are prompt configs, not data: each fixes the section headings the model must fill.

export type SummaryTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  sections: string[];
  guidance: string;
};

export const TEMPLATES: SummaryTemplate[] = [
  {
    id: "general",
    name: "General",
    description: "Works for any meeting",
    sections: ["Meeting purpose", "Key takeaways", "Topics discussed", "Next steps"],
    guidance:
      "Meeting purpose is one bullet. Key takeaways are the 3-6 most important outcomes. Topics discussed follows the order of the meeting, one bullet per topic with the substance of what was said.",
  },
  {
    id: "sales",
    name: "Sales",
    description: "Discovery and deal calls",
    sections: ["Prospect context", "Pain points", "Budget, authority & timeline", "Objections", "Next steps"],
    guidance:
      "Frame the call as a sales conversation between the host team and the other party. If a section has no evidence in the transcript, include a single bullet saying it was not discussed.",
  },
  {
    id: "customer_success",
    name: "Customer Success",
    description: "Check-ins, onboarding, renewals",
    sections: ["Customer goals", "Wins & value delivered", "Risks & blockers", "Feature requests & feedback", "Next steps"],
    guidance:
      "Treat participants raising needs or concerns as the customer. If a section has no evidence in the transcript, include a single bullet saying it was not discussed.",
  },
  {
    id: "demo",
    name: "Demo",
    description: "Product walkthroughs",
    sections: ["What was shown", "Questions asked", "Reactions & feedback", "Follow-ups"],
    guidance:
      "What was shown lists each thing demonstrated or described, in order. Questions asked pairs each question with the answer given, if any.",
  },
  {
    id: "qa",
    name: "Q&A",
    description: "Interviews, AMAs, office hours",
    sections: ["Questions & answers", "Unanswered questions", "Notable quotes"],
    guidance:
      'Each Questions & answers bullet is "Q: <question> — A: <answer>", naming who asked and who answered. Notable quotes are short verbatim quotes with the speaker name.',
  },
  {
    id: "retrospective",
    name: "Retrospective",
    description: "Team retros and project reviews",
    sections: ["What went well", "What didn't go well", "Ideas & improvements", "Action items"],
    guidance:
      "Attribute points to the people who raised them. Action items name an owner when one was stated.",
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t])) as Record<TemplateId, SummaryTemplate>;
