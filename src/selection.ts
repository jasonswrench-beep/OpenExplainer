// The full-screen page where the author chooses a rectangle on a snapshot of a screen. OpenExplainer opens it in its own
// window, exactly over the screen, after taking the snapshot. The rules for the rectangle are in capture/selection.ts.
//
// It is made to be used three ways, all at once and kept in step: the mouse (drag to draw, drag inside to move, drag a
// corner to resize), the keyboard (arrow keys move, Shift with them resizes, Control makes the step 10, Enter captures,
// Escape cancels), and four number boxes, which are also what a screen reader user works with. A live region says the
// size and place whenever they change. Escape, the Cancel button and closing the window all cancel, so it can never trap.
import { invoke } from "@tauri-apps/api/core";
import { checkRegionInput } from "./capture/region.ts";
import {
  applyKey, clampRect, contains, cssToSnapshot, describeRect, keyAction, moveRect, panelSide, rectFromCorners,
  resizeFromCorner, snapshotToCss, type Corner, type Point, type Rect,
} from "./capture/selection.ts";

interface PageData {
  snapshot: string;
  screen: { width: number; height: number; number?: number };
  initial: Rect;
}

const data = (window as unknown as { __SELECTION?: PageData }).__SELECTION;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $("stage");
const shot = $<HTMLImageElement>("shot");
const box = $("box");
const sizeLabel = $("size");
const panel = $("panel");
const stateEl = $("state");
const problemEl = $("problem");
const goButton = $<HTMLButtonElement>("go");
const stopButton = $<HTMLButtonElement>("stop");
const fields = { left: $<HTMLInputElement>("f-left"), top: $<HTMLInputElement>("f-top"), width: $<HTMLInputElement>("f-width"), height: $<HTMLInputElement>("f-height") };

let finished = false;
const finish = (rect: Rect | null) => {
  if (finished) return;
  finished = true;
  goButton.disabled = true;
  stopButton.disabled = true;
  void invoke("selection_finish", { rect });
};

if (data) void start(data);

async function start(page: PageData) {
  const dpr = window.devicePixelRatio || 1;
  const bounds = { width: page.screen.width, height: page.screen.height };
  const screenName = `Screen ${page.screen.number ?? 1}`;
  // The screen with its corner at 0, 0: the number boxes count from the screen's own corner.
  const flat = { number: page.screen.number ?? 1, x: 0, y: 0, width: bounds.width, height: bounds.height, primary: true, scale_percent: 100 };
  let rect = clampRect(page.initial, bounds);
  $("where").textContent = `${screenName}, ${bounds.width} by ${bounds.height} pixels. This is a snapshot taken a moment ago.`;

  // ---- drawing the rectangle ----
  const toCss = (value: number) => `${snapshotToCss(value, dpr)}px`;
  function render(except?: HTMLInputElement) {
    box.style.left = toCss(rect.left);
    box.style.top = toCss(rect.top);
    box.style.width = toCss(rect.width);
    box.style.height = toCss(rect.height);
    sizeLabel.textContent = `${rect.width} × ${rect.height} pixels`;
    const above = snapshotToCss(rect.top, dpr) > 32;
    sizeLabel.style.left = toCss(rect.left);
    sizeLabel.style.top = above ? `${snapshotToCss(rect.top, dpr) - 30}px` : `${snapshotToCss(rect.top + rect.height, dpr) + 8}px`;
    for (const [name, input] of Object.entries(fields) as [keyof Rect, HTMLInputElement][]) {
      if (input !== except) input.value = String(rect[name]);
    }
    const side = panelSide({ top: snapshotToCss(rect.top, dpr), height: snapshotToCss(rect.height, dpr) }, panel.offsetHeight, stage.clientHeight);
    panel.className = side;
  }

  // ---- telling a screen reader, once the changes settle ----
  let announceTimer: number | undefined;
  function announceSoon() {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      stateEl.textContent = "";
      window.setTimeout(() => (stateEl.textContent = `Rectangle: ${describeRect(rect)}.`), 30);
    }, 500);
  }
  const clearProblem = () => {
    problemEl.textContent = "";
    Object.values(fields).forEach((input) => input.removeAttribute("aria-invalid"));
  };

  // ---- the four number boxes ----
  for (const input of Object.values(fields)) {
    input.addEventListener("input", () => {
      const checked = checkRegionInput(flat, { left: fields.left.value, top: fields.top.value, width: fields.width.value, height: fields.height.value });
      clearProblem();
      if (checked.ok) {
        rect = { left: checked.region.x, top: checked.region.y, width: checked.region.width, height: checked.region.height };
        render(input);
        announceSoon();
      } else {
        // Typing is allowed to be unfinished for a moment: the rectangle stays as it was and the box says what is wrong.
        input.setAttribute("aria-invalid", "true");
        problemEl.textContent = `Problem: ${checked.message}`;
      }
    });
    input.addEventListener("change", () => {
      // When the author leaves a box, it shows what the rectangle really is.
      if (!input.hasAttribute("aria-invalid")) render();
    });
  }

  // ---- the mouse ----
  type Mode =
    | { kind: "draw"; origin: Point; moved: boolean; before: Rect }
    | { kind: "move"; grab: Point }
    | { kind: "resize"; corner: Corner };
  let mode: Mode | null = null;
  const pointOf = (event: PointerEvent): Point => {
    const at = stage.getBoundingClientRect();
    return { x: cssToSnapshot(event.clientX - at.left, dpr), y: cssToSnapshot(event.clientY - at.top, dpr) };
  };
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const p = pointOf(event);
    const corner = (event.target as HTMLElement).closest<HTMLElement>("[data-corner]")?.dataset.corner as Corner | undefined;
    if (corner) mode = { kind: "resize", corner };
    else if (contains(rect, p)) mode = { kind: "move", grab: { x: p.x - rect.left, y: p.y - rect.top } };
    else mode = { kind: "draw", origin: p, moved: false, before: rect };
    try {
      stage.setPointerCapture(event.pointerId); // keeps the drag going if the pointer leaves the window
    } catch {
      // some pointer sources cannot be captured: the drag still works while the pointer is over the page
    }
    clearProblem();
    event.preventDefault();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!mode) return;
    const p = pointOf(event);
    if (mode.kind === "draw") {
      if (!mode.moved && Math.hypot(p.x - mode.origin.x, p.y - mode.origin.y) < 3 * dpr) return; // a click is not a drag
      mode.moved = true;
      rect = rectFromCorners(mode.origin, p, bounds);
    } else if (mode.kind === "move") {
      rect = moveRect(rect, p.x - mode.grab.x - rect.left, p.y - mode.grab.y - rect.top, bounds);
    } else {
      rect = resizeFromCorner(rect, mode.corner, p, bounds);
    }
    render();
  });
  const endDrag = () => {
    if (!mode) return;
    const wasClick = mode.kind === "draw" && !mode.moved;
    mode = null;
    if (!wasClick) announceSoon();
    box.focus();
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  // ---- the keyboard ----
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return finish(null);
    }
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.tagName !== "BUTTON") {
      event.preventDefault();
      return confirm();
    }
    if (target instanceof HTMLInputElement) return; // in a number box the arrow keys move the text cursor
    const action = keyAction(event);
    if (!action) return;
    event.preventDefault();
    rect = applyKey(rect, action, bounds);
    clearProblem();
    render();
    announceSoon();
  });

  function confirm() {
    if (problemEl.textContent) {
      const bad = Object.values(fields).find((input) => input.hasAttribute("aria-invalid"));
      return void bad?.focus();
    }
    finish(rect);
  }
  goButton.addEventListener("click", confirm);
  stopButton.addEventListener("click", () => finish(null));

  // ---- the snapshot ----
  const bytes = await invoke<ArrayBuffer>("read_capture_picture", { path: page.snapshot });
  shot.onload = () => {
    const width = snapshotToCss(bounds.width, dpr);
    const height = snapshotToCss(bounds.height, dpr);
    shot.style.width = `${width}px`;
    shot.style.height = `${height}px`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    render();
    box.focus();
    stateEl.textContent = `Select the part of ${screenName} to capture. The rectangle is ${describeRect(rect)}. Use the arrow keys to move it, Shift with the arrow keys to resize it, Enter to capture it and Escape to cancel.`;
    // Only now is the page really there: the app waits for this, and closes the window by itself if it never comes.
    void invoke("selection_ready");
  };
  shot.src = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}
