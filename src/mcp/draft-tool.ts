// The assistant's draft tool (part 8 of docs/local-ai-plan.md): an assistant asks OpenExplainer to draft text with the built-in model, and the drafts wait in the book's Drafts list for the author to accept or throw away.
// Two rules keep it safe with nobody at the keyboard:
// * It uses only the built-in model, which runs on this PC. The author's own key for a hosted service is never used here, because the author cannot see what is sent. (CORE-REQUESTS.md, request 3.)
// * An assistant can never accept a draft. Accepting is the author's, in the program.
// With no model ready it does not fail: it hands back the facts (what the model would have been given), so the assistant can write the text itself and put it in the book with describe_picture or set_page.
import { chapterMaterial, draftChapterText, type ChapterTextRole } from "../ai/chapter-text.ts";
import { draftBoxes, topicMaterial } from "../ai/boxes.ts";
import { cluesFor, draftCallouts, reportWords } from "../ai/drafting.ts";
import { boxReportWords } from "../ai/boxes.ts";
import { chapterReportWords } from "../ai/chapter-text.ts";
import type { Answer, AskOptions, ChatMessage } from "../ai/types.ts";
import { findNode, numbering, type Project, type TreeNode } from "../project/model.ts";
import type { Draft } from "../project/drafts.ts";
import { text, type ToolDef } from "./protocol.ts";
import type { Session } from "./session.ts";

/** What the draft tool needs from the app. The real one is in src/mcp/main.ts; a test gives a pretend one. */
export interface Drafter {
  /** Whether the built-in model is chosen and ready. When not, `why` says so in words (and that a key is never used here). */
  status(): Promise<{ ready: boolean; why: string }>;
  ask(messages: ChatMessage[], options: AskOptions): Promise<Answer>;
  /** What is kept with each draft as the one that wrote it. */
  model: string;
}

export const DRAFT_KINDS = ["callouts", "opener", "summary", "boxes"] as const;
type Kind = (typeof DRAFT_KINDS)[number];

const asString = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

/** The facts a draft would be written from, for an assistant to write from itself. */
function facts(project: Project, node: TreeNode, kind: Kind, pictureId: string | undefined): unknown {
  switch (kind) {
    case "callouts": {
      const numbers = numbering(project.tree);
      const rows: unknown[] = [];
      for (const picture of node.pictures) {
        if (pictureId && picture.id !== pictureId) continue;
        (picture.callouts ?? []).forEach((callout, index) => {
          if (callout.description.trim() !== "") return;
          const clues = cluesFor(project, { node, picture, callout, index });
          rows.push({ picture_id: picture.id, callout_id: callout.id, letter: String.fromCharCode(65 + (index % 26)), name: callout.name, clues: clues.draftable ? clues.lines : [], cannot_draft_because: clues.draftable ? undefined : clues.whyNot });
        });
      }
      return { topic: `${numbers.get(node.id) ?? ""} ${node.title}`.trim(), callouts_without_a_sentence: rows };
    }
    case "opener":
    case "summary":
      return chapterMaterial(project, node.id, kind) ?? { problem: "There is nothing written here to work from yet." };
    case "boxes":
      return topicMaterial(project, node.id) ?? { problem: "There is no paragraph text here to work from." };
  }
}

const describeDraft = (d: Draft) => {
  switch (d.kind) {
    case "callout-sentence": return { id: d.id, kind: d.kind, picture_id: d.pictureId, callout_id: d.calloutId, text: d.text };
    case "chapter-text": return { id: d.id, kind: d.kind, role: d.role, text: d.text };
    case "box": return { id: d.id, kind: d.kind, box_kind: d.boxKind, text: d.text, evidence: d.evidence };
    case "procedure": return { id: d.id, kind: d.kind };
  }
};

export function createDraftTools(session: Session, drafter: Drafter): ToolDef[] {
  return [
    {
      name: "draft_text",
      description:
        "Asks the built-in AI model on this PC for a draft: kind callouts (a sentence for each callout in the topic, or on one picture, that has none), opener (the opening paragraph of a chapter; topic_id is the chapter), " +
        "summary (a chapter summary; topic_id is the topic that will hold it) or boxes (suggested boxed notes for a topic). The drafts are put in the book's Drafts list, marked as drafts. You cannot accept them: the author does, in the program. " +
        "Returns what was drafted. The author's own key for a hosted service is never used here, because nobody can see what would be sent. If the built-in model is not ready, nothing is drafted and the facts the model would have been given come back instead, " +
        "so you can write the text yourself (describe_picture for a callout, set_page for the rest).",
      inputSchema: {
        type: "object",
        properties: {
          topic_id: { type: "string", description: "The topic, or for an opener the chapter." },
          kind: { type: "string", enum: [...DRAFT_KINDS], description: "What to draft." },
          picture_id: { type: "string", description: "For callouts: draft only for this picture." },
        },
        required: ["topic_id", "kind"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const project = session.require();
        const id = asString(args.topic_id);
        if (!id) throw new Error("topic_id is needed, as text.");
        const node = findNode(project.tree, id);
        if (!node) throw new Error(`There is no topic with the id "${id}". get_outline lists the topics and their ids.`);
        const kind = asString(args.kind) as Kind | undefined;
        if (!kind || !DRAFT_KINDS.includes(kind)) throw new Error(`kind must be one of: ${DRAFT_KINDS.join(", ")}.`);
        const pictureId = asString(args.picture_id);
        const status = await drafter.status();
        if (!status.ready) {
          return text(`Nothing was drafted. ${status.why}\nHere are the facts the model would have been given, to write from yourself:\n${JSON.stringify(facts(project, node, kind, pictureId), null, 2)}`);
        }
        const before = new Set(project.drafts.map((d) => d.id));
        const common = { project, nodeId: node.id, ask: (m: ChatMessage[], o: AskOptions) => drafter.ask(m, o), model: drafter.model, now: () => new Date().toISOString() };
        let lines: string[];
        if (kind === "callouts") lines = reportWords(await draftCallouts({ ...common, ...(pictureId ? { pictureId } : {}) }));
        else if (kind === "boxes") lines = boxReportWords(await draftBoxes(common));
        else lines = chapterReportWords(await draftChapterText({ ...common, role: kind as ChapterTextRole }), kind as ChapterTextRole);
        const made = project.drafts.filter((d) => !before.has(d.id));
        const saved = made.length > 0 && session.filePath ? `\nSaved to ${await session.save()}.` : "";
        return text(`${lines.join(" ")}${saved}\n${made.length > 0 ? `Waiting in the book's Drafts list for the author to accept or throw away (you cannot accept them):\n${JSON.stringify(made.map(describeDraft), null, 2)}` : "No drafts were made."}`);
      },
    },
  ];
}
