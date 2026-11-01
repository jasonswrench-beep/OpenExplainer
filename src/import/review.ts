// Bringing back the comments of a review round. A review copy (the Word export made for review, src/export/docx.ts) ties each block and each topic heading to the book with a bookmark. Reviewers add comments in
// Word and send the file back; this reads those comments, finds the block each one was made on, and adds it to that block as an open comment in the book, with the reviewer's name in front of the words.
// A comment on a heading goes to the topic's first block. A comment the book cannot place (the file is not a review copy of this book, or the text it was on is no longer in the book) is counted, not lost
// silently. Nothing here changes the words of the book, and nothing needs a screen. See docs/exports.md ("Word review copy").
import { addComment, MOST_COMMENT } from "../project/comments.ts";
import { findNode, type Project } from "../project/model.ts";
import { unzip } from "../project/zip.ts";
import { BLOCK_MARK, bookmarkName, REVIEW_AUTHOR, TOPIC_MARK } from "../export/docx.ts";
import { childNamed, childrenNamed, descendantsNamed, parseXml, textOf, type XmlNode } from "./xml.ts";

export interface ReviewComment {
  topicId: string;
  blockId: string;
  author: string;
  /** When the reviewer wrote it, as Word has it. */
  date: string;
  text: string;
}

export interface ReviewRead {
  comments: ReviewComment[];
  /** What was found and what could not be placed, in plain words. */
  report: string[];
}

/** Visits the paragraphs of a body in reading order, including those in tables and content controls. */
function paragraphs(node: XmlNode, visit: (p: XmlNode) => void): void {
  for (const c of node.children) {
    if (c.name === "w:p") visit(c);
    else if (["w:tbl", "w:tr", "w:tc", "w:sdt", "w:sdtContent", "w:customXml"].includes(c.name)) paragraphs(c, visit);
  }
}

/** Reads the comments out of a Word file that came back from a review round and says where in the book each belongs. Throws, in words, when the file is not a Word file. */
export async function readReviewComments(bytes: Uint8Array, project: Project): Promise<ReviewRead> {
  let files: Record<string, Uint8Array>;
  try {
    files = await unzip(bytes);
  } catch {
    throw new Error("This is not a Word file (.docx): it could not be opened as one. Nothing was brought in.");
  }
  if (!files["word/document.xml"]) throw new Error("This is not a Word file (.docx): it has no word/document.xml. Nothing was brought in.");
  const report: string[] = [];
  if (!files["word/comments.xml"]) return { comments: [], report: ["The file has no comments, so there was nothing to bring in."] };
  const text = (path: string) => new TextDecoder().decode(files[path]);

  // What each bookmark of a review copy stands for.
  const places = new Map<string, { topicId: string; blockId?: string }>();
  const mark = (nodes: typeof project.tree) => {
    for (const node of nodes) {
      places.set(bookmarkName(TOPIC_MARK, node.id), { topicId: node.id });
      for (const block of node.page?.blocks ?? []) places.set(bookmarkName(BLOCK_MARK, block.id), { topicId: node.id, blockId: block.id });
      mark(node.children);
    }
  };
  mark(project.tree);

  // The place each comment was made at: the block of its own paragraph, or the last block or heading before it.
  const body = childNamed(parseXml(text("word/document.xml")), "w:body");
  if (!body) throw new Error("This Word file has no body, so there was nothing to bring in.");
  const anchors = new Map<string, { topicId: string; blockId?: string } | null>();
  let last: { topicId: string; blockId?: string } | null = null;
  paragraphs(body, (p) => {
    const own = descendantsNamed(p, "w:bookmarkStart").map((b) => places.get(b.attrs["w:name"] ?? "")).find((x) => x !== undefined) ?? null;
    const ids = [...descendantsNamed(p, "w:commentRangeStart"), ...descendantsNamed(p, "w:commentReference")].map((c) => c.attrs["w:id"]).filter((id): id is string => id !== undefined);
    for (const id of ids) if (!anchors.has(id)) anchors.set(id, own ?? last);
    if (own) last = own;
  });

  const comments: ReviewComment[] = [];
  let ours = 0;
  let empty = 0;
  let lost = 0;
  let total = 0;
  for (const c of childrenNamed(parseXml(text("word/comments.xml")), "w:comment")) {
    total++;
    const author = (c.attrs["w:author"] ?? "").trim() || "A reviewer";
    if (author === REVIEW_AUTHOR) { ours++; continue; }
    const words = childrenNamed(c, "w:p").map((p) => textOf(p).trim()).filter(Boolean).join("\n");
    if (words === "") { empty++; continue; }
    const where = anchors.get(c.attrs["w:id"] ?? "") ?? null;
    const topic = where ? findNode(project.tree, where.topicId) : null;
    // On a heading: the topic's first block.
    const blockId = where?.blockId ?? topic?.page?.blocks[0]?.id;
    if (!where || !topic || !blockId) { lost++; continue; }
    comments.push({ topicId: where.topicId, blockId, author, date: c.attrs["w:date"] ?? "", text: words });
  }
  report.push(`The file has ${total} ${total === 1 ? "comment" : "comments"}: ${comments.length} from reviewers can be brought in.`);
  if (ours) report.push(`${ours} ${ours === 1 ? "was" : "were"} written by the author in the review copy and ${ours === 1 ? "is" : "are"} already in the book.`);
  if (empty) report.push(`${empty} had no words and ${empty === 1 ? "was" : "were"} left out.`);
  if (lost) report.push(`${lost} could not be placed, because the text they were made on is not in this book (the file may be a copy of another book, or the text has been taken out). They were not brought in.`);
  return { comments, report };
}

/** Adds the comments to their blocks as open comments, with the reviewer's name in front. A comment already there with the same words is not added again. Returns how many were added and how many were already there. */
export function addReviewComments(project: Project, comments: ReviewComment[], now: string): { added: number; already: number } {
  let added = 0;
  let already = 0;
  for (const c of comments) {
    const page = findNode(project.tree, c.topicId)?.page;
    if (!page) continue;
    const full = `${c.author}: ${c.text}`;
    const words = full.length > MOST_COMMENT ? `${full.slice(0, MOST_COMMENT - 1)}…` : full;
    if ((page.comments ?? []).some((x) => x.blockId === c.blockId && x.text === words)) { already++; continue; }
    const when = Number.isNaN(Date.parse(c.date)) ? now : new Date(c.date).toISOString();
    if (addComment(page, c.blockId, words, when)) added++;
  }
  return { added, already };
}
