// After a click-by-click capture the author reviews every click: keeps or leaves out each one, and describes its picture.
// This file is the part of that which needs no screen: turning the author's answers into pictures for the project, and the words.
import type { Picture } from "../project/model.ts";
import { describeShot, type ClickShot } from "./clicks.ts";

/** What the author decided about one click in the review list. */
export interface ReviewAnswer {
  keep: boolean;
  /** What the picture shows, for a screen reader. Empty means it still needs one. It is never filled in unless the author did it. */
  description: string;
}

export interface KeptPictures {
  /** The pictures to add to the topic, in click order. */
  pictures: Picture[];
  /** Their files, by the path each picture names. */
  files: Map<string, Uint8Array>;
}

/**
 * The pictures to add for the clicks the author kept, in the order the clicks were made. `answers[i]` belongs to `shots[i]`; a click with no
 * answer is not kept. A picture's description is exactly what the author wrote (trimmed), and empty if they wrote nothing, so it shows as
 * "Needs a description" until they do.
 */
export function picturesFromReview(shots: ClickShot[], answers: ReviewAnswer[], makeId: () => string, capturedAt: string): KeptPictures {
  const pictures: Picture[] = [];
  const files = new Map<string, Uint8Array>();
  shots.forEach((shot, i) => {
    const answer = answers[i];
    if (!answer?.keep) return;
    const id = makeId();
    const file = `images/${id}.${shot.extension}`;
    files.set(file, shot.bytes);
    pictures.push({
      id,
      file,
      width: shot.width,
      height: shot.height,
      altText: answer.description.trim(),
      source: { kind: "click", capturedAt, originalName: describeShot(shot).replace(/\.$/, "") },
      click: shot.click,
    });
  });
  return { pictures, files };
}

/** What to say after the author presses OK in the review list. */
export function addedWords(kept: number, total: number): string {
  if (kept === 0) return "No click pictures were added. Your project was not changed.";
  const pictures = `${kept} click picture${kept === 1 ? "" : "s"}`;
  return kept === total ? `Added ${pictures}.` : `Added ${kept} of ${total} click pictures. The others were left out.`;
}

/** The question asked before a captured session is thrown away, because the clicks cannot be captured again without redoing them. */
export function discardQuestion(count: number): string {
  return `Throw away the ${count === 1 ? "click" : `${count} clicks`} you captured? Nothing will be added to your project.`;
}
