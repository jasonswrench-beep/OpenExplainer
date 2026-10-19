// The "wait before capturing" number: checking what the author typed, and saying it in words.
// The wait lets the author get another program ready (open a menu, say) before the picture is taken.

/** The longest wait, in seconds. The app's shell enforces the same limit. */
export const MOST_WAIT_SECONDS = 60;

export type WaitCheck = { ok: true; seconds: number } | { ok: false; message: string };

/** Turns what was typed into a number of seconds from 0 to 60, or says in plain words what is wrong. An empty box means no wait. */
export function checkWait(text: string): WaitCheck {
  const typed = text.trim();
  if (!typed) return { ok: true, seconds: 0 };
  if (!/^\d+$/.test(typed)) {
    return { ok: false, message: `Type the wait as a whole number of seconds from 0 to ${MOST_WAIT_SECONDS}, such as 5. "${typed}" is not one.` };
  }
  const seconds = Number(typed);
  if (seconds > MOST_WAIT_SECONDS) {
    return { ok: false, message: `The longest wait is ${MOST_WAIT_SECONDS} seconds. Type a number from 0 to ${MOST_WAIT_SECONDS}.` };
  }
  return { ok: true, seconds };
}

/** "no wait", "1 second" or "5 seconds". */
export function describeWait(seconds: number): string {
  if (seconds <= 0) return "no wait";
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}
