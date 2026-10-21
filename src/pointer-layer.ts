// The handles laid over a sample picture so a box (a callout's outline, or a crop region) and a point (a callout's marker) can be drawn, moved and resized with the
// mouse, or moved and resized with the arrow keys. The rules are in src/pointing.ts. This only fills things in: the dialogs keep their number boxes as the exact
// record, and every change made here goes through them, so the checks, the live sample and Cancel work as they always did.
import { boxFromPoints, boxWords, keyStep, moveBox, movePoint, pointWords, resizeByKey, resizeCorner, toPicturePoint, type Box, type Corner, type Point, type Size } from "./pointing.ts";

/** A box the author can draw, move and resize. */
export interface BoxTarget {
  /** What it is called to a screen reader, such as "Item of callout A". */
  label: string;
  get(): Box;
  /** Called with the new box after a draw, a move or a resize. */
  set(box: Box, how: "draw" | "move" | "resize"): void;
  /** Called when a change starts. Returns a function that puts everything back, for Escape during a drag. */
  begin(): () => void;
}

/** A point the author can move, drawn as a circle `radius` picture pixels across from its middle. */
export interface PointTarget {
  label: string;
  radius: number;
  get(): Point;
  set(point: Point): void;
  begin(): () => void;
}

/** Another callout's marker: pressing it picks that callout. */
export interface OtherMarker {
  x: number;
  y: number;
  radius: number;
  label: string;
  pick(): void;
}

export interface LayerOptions {
  size: Size;
  /** Says something to a screen reader. */
  say(text: string): void;
  box?: BoxTarget;
  point?: PointTarget;
  others?: OtherMarker[];
}

export interface PointerLayer {
  element: HTMLElement;
  /** Puts the handles where the box and the point are now. Call it after the numbers change some other way. */
  update(): void;
}

let counter = 0;

const HINT = "Arrow keys move it by 1 pixel, and by 10 with Shift. Control with an arrow makes it bigger or smaller.";

/** Builds the layer. Put `element` over the picture (inside the box that holds the image, after its drawing). */
export function createPointerLayer(options: LayerOptions): PointerLayer {
  const { size, box, point } = options;
  const layer = document.createElement("div");
  layer.className = "pointer-layer";
  const id = `pl-${++counter}`;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  const hint = document.createElement("span");
  hint.id = `${id}-hint`;
  hint.className = "visually-hidden";
  hint.textContent = HINT;
  layer.append(hint);

  const place = (el: HTMLElement, b: Box) => {
    el.style.left = pct(b.x, size.width);
    el.style.top = pct(b.y, size.height);
    el.style.width = pct(b.width, size.width);
    el.style.height = pct(b.height, size.height);
  };

  /** Where the pointer is on the picture. */
  const at = (event: PointerEvent): Point => toPicturePoint({ x: event.clientX, y: event.clientY }, layer.getBoundingClientRect(), size);

  /**
   * A drag: the pointer is held on `el`, `move` is told where it is on the picture, and Escape puts everything back. Nothing else (the dialog closing on Escape,
   * another drag) can happen while it lasts.
   */
  function drag(el: HTMLElement, event: PointerEvent, undo: () => void, move: (now: Point) => void, done: () => void) {
    event.preventDefault();
    event.stopPropagation();
    el.setPointerCapture(event.pointerId);
    let finished = false;
    const finish = () => {
      finished = true;
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    };
    const onMove = (e: PointerEvent) => { if (!finished) move(at(e)); };
    const onUp = () => { if (finished) return; finish(); done(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish();
      undo();
      update();
      options.say("Cancelled. Nothing was changed.");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
  }

  /** Says the new place after the last key press of a run, not after each one. */
  const announceLater = (words: () => string) => {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => options.say(words()), 500);
  };

  let boxEl: HTMLElement | null = null;
  let markerEl: HTMLElement | null = null;
  const otherEls: { el: HTMLElement; spec: OtherMarker }[] = [];

  // Other callouts' markers, to pick them.
  for (const spec of options.others ?? []) {
    const el = document.createElement("div");
    el.className = "pointer-other";
    el.setAttribute("aria-hidden", "true");
    el.title = spec.label;
    el.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); spec.pick(); });
    layer.append(el);
    otherEls.push({ el, spec });
  }

  if (box) {
    // Dragging on the empty picture draws a new box.
    layer.addEventListener("pointerdown", (event) => {
      if (event.target !== layer || event.button !== 0) return;
      const start = at(event);
      const undo = box.begin();
      let drew = false;
      drag(layer, event, undo, (now) => {
        const drawn = boxFromPoints(start, now, size);
        if (!drawn) return;
        drew = true;
        box.set(drawn, "draw");
        update();
      }, () => { if (drew) options.say(boxWords(box.label, box.get())); });
    });

    boxEl = document.createElement("div");
    boxEl.className = "pointer-box";
    boxEl.tabIndex = 0;
    boxEl.setAttribute("role", "application");
    boxEl.setAttribute("aria-roledescription", "movable outline");
    boxEl.setAttribute("aria-label", box.label);
    boxEl.setAttribute("aria-describedby", hint.id);
    boxEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target !== boxEl) return;
      const start = at(event);
      const original = box.get();
      const undo = box.begin();
      drag(boxEl!, event, undo, (now) => { box.set(moveBox(original, now.x - start.x, now.y - start.y, size), "move"); update(); }, () => options.say(boxWords(box.label, box.get())));
      boxEl!.focus();
    });
    boxEl.addEventListener("keydown", (event) => {
      const step = keyStep(event.key, { shift: event.shiftKey, ctrl: event.ctrlKey });
      if (!step || event.altKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const now = box.get();
      box.begin();
      box.set(step.resize ? resizeByKey(now, step.dx, step.dy, size) : moveBox(now, step.dx, step.dy, size), step.resize ? "resize" : "move");
      update();
      announceLater(() => boxWords(box.label, box.get()));
    });
    for (const corner of ["nw", "ne", "sw", "se"] as Corner[]) {
      const handle = document.createElement("div");
      handle.className = `pointer-corner ${corner}`;
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const original = box.get();
        const undo = box.begin();
        drag(handle, event, undo, (now) => { box.set(resizeCorner(original, corner, now, size), "resize"); update(); }, () => options.say(boxWords(box.label, box.get())));
      });
      boxEl.append(handle);
    }
    layer.append(boxEl);
  }

  if (point) {
    markerEl = document.createElement("div");
    markerEl.className = "pointer-marker";
    markerEl.tabIndex = 0;
    markerEl.setAttribute("role", "application");
    markerEl.setAttribute("aria-roledescription", "movable marker");
    markerEl.setAttribute("aria-label", point.label);
    markerEl.setAttribute("aria-describedby", hint.id);
    markerEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const start = at(event);
      const original = point.get();
      const undo = point.begin();
      drag(markerEl!, event, undo, (now) => { point.set(movePoint(original, now.x - start.x, now.y - start.y, size)); update(); }, () => options.say(pointWords(point.label, point.get())));
      markerEl!.focus();
    });
    markerEl.addEventListener("keydown", (event) => {
      const step = keyStep(event.key, { shift: event.shiftKey, ctrl: false });
      if (!step || event.altKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      point.begin();
      point.set(movePoint(point.get(), step.dx, step.dy, size));
      update();
      announceLater(() => pointWords(point.label, point.get()));
    });
    layer.append(markerEl);
  }

  function update() {
    if (box && boxEl) place(boxEl, box.get());
    if (point && markerEl) {
      const p = point.get();
      markerEl.style.left = pct(p.x, size.width);
      markerEl.style.top = pct(p.y, size.height);
      markerEl.style.width = pct(point.radius * 2, size.width);
    }
    for (const { el, spec } of otherEls) {
      el.style.left = pct(spec.x, size.width);
      el.style.top = pct(spec.y, size.height);
      el.style.width = pct(spec.radius * 2, size.width);
    }
  }
  update();
  return { element: layer, update };
}
