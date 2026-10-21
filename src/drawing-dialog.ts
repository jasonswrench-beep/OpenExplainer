// The Drawing dialog: the arrows, text boxes, rectangles and numbered markers drawn on one picture. Each mark has its own group of boxes (its place in pixels, its colours,
// its alternative text), a sample of the picture shows them, and the selected mark can be drawn, moved and resized on the sample with the mouse or the arrow keys (the typed
// numbers always show the exact values). Colours are chosen from a short list or typed as a code, and as soon as one is chosen its contrast is shown in words: a warning that
// never stops anyone, recorded when a mark is saved with low contrast. A mark's colours can be saved as a named style and applied to other marks. Nothing changes until the
// author presses Save; Cancel leaves the marks and the styles as they were. The rules are in src/project/shapes.ts, contrast.ts and styles.ts.
import { loadBackdrop, type Backdrop } from "./backdrop.ts";
import { open } from "./dialogs.ts";
import { marksOverlay } from "./picture-marks.ts";
import { createPointerLayer, type PointerLayer } from "./pointer-layer.ts";
import { markerRadius } from "./project/callouts.ts";
import { normalizeHex, SWATCHES } from "./project/contrast.ts";
import type { Picture } from "./project/model.ts";
import {
  checkShapeInput, failing, fitHeight, inputFromShape, kindName, MIN_SIDE, needsAlt, newShape, shapeBounds, SHAPE_FIELDS, SHAPE_KINDS, shapeChecks, wordsFit,
  type FieldSpec, type Shape, type ShapeKind,
} from "./project/shapes.ts";
import { applyStyle, checkStyleName, styleChecks, styleFromShape, type NamedStyle } from "./project/styles.ts";

export interface DrawingOptions {
  picture: Picture;
  /** Where the picture's bytes can be shown from, or `null` when the file is missing. */
  imageUrl: string | null;
  /** The project's named styles now. */
  styles: NamedStyle[];
}

export interface DrawingResult {
  shapes: Shape[];
  styles: NamedStyle[];
}

const OTHER = "other";
const NONE = "none";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Draws the Drawing dialog. Returns the picture's new marks and the project's new styles, or `null` if cancelled. */
export async function drawingDialog(options: DrawingOptions): Promise<DrawingResult | null> {
  const { picture, imageUrl } = options;
  const size = { width: picture.width, height: picture.height };
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "dlg-title");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="dlg-title">Drawing</h2>
      <p class="help" id="dr-help"></p>
      <p class="help" id="dr-point-help"></p>
      <div id="dr-preview"></div>
      <p id="dr-status" class="visually-hidden" role="status"></p>
      <p id="dr-add"></p>
      <div id="dr-rows"></div>
      <h3>Named styles</h3>
      <p class="help" id="dr-styles-help"></p>
      <ul id="dr-styles" class="comment-list" aria-label="Named styles in this project"></ul>
      <p id="dr-error" class="error" role="alert"></p>
      <p><button value="ok">Save the drawing</button> <button value="cancel" formnovalidate>Cancel</button></p>
    </form>`;
  dialog.querySelector("#dr-help")!.textContent =
    "Marks are drawn on the picture without changing it, so they can be edited later. Add an arrow, a text box, a rectangle or a numbered marker, then place it with the numbers or on the picture. " +
    `Numbers count in pixels from the top left corner of the picture, which is ${picture.width} by ${picture.height} pixels. Every mark can have alternative text, and the words of a text box and the labels of markers are part of the picture's description. ` +
    "The contrast of each colour is checked as you choose it. It is a warning only: you can keep any colour, and a mark saved with low contrast is listed in the accessibility check.";
  dialog.querySelector("#dr-point-help")!.textContent =
    "On the picture below, the mark that says \"selected on the picture\" has handles. Drag on an empty place to draw it again, drag it to move it, drag a corner or an end to resize it, " +
    "or press another mark to select that one. With the keyboard, Tab to a handle on the picture: the arrow keys move it by 1 pixel, by 10 with Shift, and Control with an arrow makes a box bigger or smaller. " +
    "Escape during a drag puts things back. The boxes always show the exact numbers.";
  const working: Shape[] = copy(picture.shapes ?? []);
  const styles: NamedStyle[] = copy(options.styles);
  const errorEl = dialog.querySelector<HTMLElement>("#dr-error")!;
  const statusEl = dialog.querySelector<HTMLElement>("#dr-status")!;
  const rowsEl = dialog.querySelector<HTMLElement>("#dr-rows")!;
  const previewEl = dialog.querySelector<HTMLElement>("#dr-preview")!;
  const stylesEl = dialog.querySelector<HTMLElement>("#dr-styles")!;
  const say = (text: string) => { statusEl.textContent = ""; setTimeout(() => (statusEl.textContent = text), 30); };
  const clearErrors = () => { errorEl.textContent = ""; dialog.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid")); };
  let backdrop: Backdrop | null = null;
  let activeId: string | null = working.length ? working[0].id : null;
  const indexOf = (id: string | null) => working.findIndex((s) => s.id === id);
  const current = (): Shape | null => working[indexOf(activeId)] ?? null;
  const nameOf = (i: number) => `mark ${i + 1}, ${kindName(working[i].kind).toLowerCase()}`;
  let previewBox: HTMLElement | null = null;
  let layer: PointerLayer | null = null;

  // ---- The sample ---------------------------------------------------------------------------------
  function previewBoxOf(): HTMLElement | null {
    if (!imageUrl) return null;
    if (!previewBox) {
      previewBox = document.createElement("span");
      previewBox.className = "thumbbox";
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = picture.altText || "The picture the marks are drawn on";
      img.className = "thumb callout-preview";
      previewBox.append(img);
      previewEl.append(previewBox);
    }
    return previewBox;
  }

  function drawPreview() {
    const box = previewBoxOf();
    if (!box) return;
    box.querySelector("svg.circle-overlay")?.remove();
    const marks = marksOverlay({ ...size, callouts: picture.callouts, shapes: working }, null);
    if (marks) box.insertBefore(marks, layer?.element ?? null);
  }

  // ---- Reading what is typed --------------------------------------------------------------------------
  const field = (i: number, name: string) => rowsEl.querySelector<HTMLInputElement>(`#dr-${i}-${name}`);
  const inputOf = (i: number) => Object.fromEntries(SHAPE_FIELDS[working[i].kind].map((f) => [f.field, field(i, f.field)?.value ?? ""]));
  const tidy = (text: string, most: number) => text.replace(/\s+/g, " ").trim().slice(0, most);

  /** Puts the numbers of a mark into its boxes, after the picture was pointed at. */
  function syncNumbers(i: number) {
    const values = inputFromShape(working[i]);
    for (const spec of SHAPE_FIELDS[working[i].kind]) {
      if (spec.type !== "number") continue;
      const el = field(i, spec.field);
      if (el) el.value = values[spec.field];
    }
    clearErrors();
    renderFit(i);
    renderContrast(i);
  }

  /** Takes what is typed in one group into the mark, as far as it is good; the rest keeps its last good value. */
  function takeRow(i: number) {
    const shape = working[i];
    const input = inputOf(i);
    shape.alt = tidy(input.alt ?? "", 300);
    if (shape.kind === "text") shape.text = tidy(input.text ?? "", 300);
    const checked = checkShapeInput(shape, input, size);
    if (checked.ok) working[i] = checked.shape;
    renderFit(i);
    renderContrast(i);
    drawPreview();
    layer?.update();
  }

  // ---- Contrast, said in words ----------------------------------------------------------------------------
  function renderContrast(i: number) {
    const list = rowsEl.querySelector<HTMLElement>(`#dr-${i}-contrast`);
    if (!list || !working[i]) return;
    const shape = working[i];
    const behind = backdrop ? backdrop.behind(shape) : null;
    const checks = shapeChecks(shape, behind);
    list.replaceChildren();
    for (const check of checks) {
      const li = document.createElement("li");
      li.textContent = `${check.ok ? "✓" : "⚠"} ${check.words}`;
      list.append(li);
    }
    const needsBackdrop = shape.kind !== "text" || !(shape as { fill: string | null }).fill;
    if (needsBackdrop && !behind) {
      const li = document.createElement("li");
      li.textContent = "The colour of the picture behind this mark could not be read, so its contrast against the picture is not checked.";
      list.append(li);
    }
    const alt = rowsEl.querySelector<HTMLElement>(`#dr-${i}-altnote`);
    if (alt) alt.hidden = !needsAlt(shape);
  }

  function renderFit(i: number) {
    const note = rowsEl.querySelector<HTMLElement>(`#dr-${i}-fit`);
    const shape = working[i];
    if (!note || !shape || shape.kind !== "text") return;
    const fits = wordsFit(shape);
    note.querySelector("span")!.textContent = fits ? "The words fit in the box." : "The words do not fit in the box: some are outside it. Make the box taller or wider, or the letters smaller.";
    note.querySelector("button")!.hidden = fits;
  }

  /** A short announcement after a colour is chosen: the first problem, or that the colours are fine. */
  function announceContrast(i: number) {
    const shape = working[i];
    const bad = failing(shapeChecks(shape, backdrop ? backdrop.behind(shape) : null));
    say(bad.length ? `Contrast warning for ${nameOf(i)}. ${bad[0].words}` : `The contrast of ${nameOf(i)} is fine.`);
  }

  // ---- The colour control -----------------------------------------------------------------------------------
  function colourControl(i: number, spec: FieldSpec, value: string): HTMLElement {
    const optional = spec.type === "optionalColor";
    const wrap = document.createElement("p");
    wrap.className = "co-number dr-colour";
    const label = document.createElement("label");
    label.htmlFor = `dr-${i}-${spec.field}`;
    label.textContent = `${spec.label}, ${nameOf(i)}`;
    const pick = document.createElement("select");
    pick.id = `dr-${i}-${spec.field}-pick`;
    pick.setAttribute("aria-label", `${spec.label}, ${nameOf(i)}: choose from the list`);
    if (optional) pick.append(new Option("None", NONE));
    for (const swatch of SWATCHES) pick.append(new Option(`${swatch.name} (${swatch.code})`, swatch.code));
    pick.append(new Option("Other (type the code)", OTHER));
    const code = document.createElement("input");
    code.type = "text";
    code.id = `dr-${i}-${spec.field}`;
    code.size = spec.size;
    code.autocomplete = "off";
    code.setAttribute("aria-describedby", "dr-error");
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.setAttribute("aria-hidden", "true");
    const sync = () => {
      const hex = normalizeHex(code.value);
      const none = optional && (code.value.trim() === "" || code.value.trim().toLowerCase() === NONE);
      pick.value = none ? NONE : hex && SWATCHES.some((s) => s.code === hex) ? hex : OTHER;
      chip.style.background = none ? "transparent" : hex ?? "transparent";
      chip.classList.toggle("none", none);
    };
    code.value = value === "none" ? "none" : value;
    sync();
    pick.addEventListener("change", () => {
      if (pick.value === OTHER) { code.focus(); return; }
      code.value = pick.value === NONE ? NONE : pick.value;
      sync();
      code.dispatchEvent(new Event("input", { bubbles: true }));
      announceContrast(i);
    });
    code.addEventListener("input", sync);
    code.addEventListener("change", () => announceContrast(i));
    wrap.append(label, document.createElement("br"), pick, " ", code, " ", chip);
    return wrap;
  }

  // ---- The groups ---------------------------------------------------------------------------------------------
  function drawRows(focus?: { index: number; part: string }) {
    rowsEl.replaceChildren();
    working.forEach((shape, i) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = `Mark ${i + 1}: ${kindName(shape.kind)}`;
      fieldset.append(legend);
      const values = inputFromShape(shape);
      const numbers = document.createElement("div");
      numbers.className = "co-numbers";
      for (const spec of SHAPE_FIELDS[shape.kind]) {
        if (spec.type === "color" || spec.type === "optionalColor") { numbers.append(colourControl(i, spec, values[spec.field])); continue; }
        const p = document.createElement("p");
        p.className = spec.type === "text" ? "dr-wide" : "co-number";
        const label = document.createElement("label");
        label.htmlFor = `dr-${i}-${spec.field}`;
        label.textContent = `${spec.label}, ${nameOf(i)}`;
        const input = document.createElement("input");
        input.type = "text";
        input.id = `dr-${i}-${spec.field}`;
        input.size = spec.size;
        input.autocomplete = "off";
        if (spec.type === "number") input.inputMode = "numeric";
        input.value = values[spec.field];
        input.setAttribute("aria-describedby", "dr-error");
        p.append(label, document.createElement("br"), input);
        numbers.append(p);
      }
      fieldset.append(numbers);

      const altNote = document.createElement("p");
      altNote.id = `dr-${i}-altnote`;
      altNote.className = "help";
      altNote.textContent = `This ${kindName(shape.kind).toLowerCase()} has no alternative text yet. Say what it points at or marks, so a reader who cannot see the picture knows.`;
      altNote.hidden = !needsAlt(shape);
      fieldset.append(altNote);

      if (shape.kind === "text") {
        const fit = document.createElement("p");
        fit.id = `dr-${i}-fit`;
        fit.className = "help";
        const sentence = document.createElement("span");
        const make = document.createElement("button");
        make.type = "button";
        make.id = `dr-${i}-fitbutton`;
        make.textContent = "Make the box tall enough";
        make.setAttribute("aria-label", `Make the box tall enough for its words, ${nameOf(i)}`);
        make.addEventListener("click", () => {
          takeRow(i);
          const box = (working[i] as Extract<Shape, { kind: "text" }>);
          box.box.height = Math.min(size.height - box.box.y, Math.max(MIN_SIDE, fitHeight(box)));
          syncNumbers(i);
          drawPreview();
          layer?.update();
          say(`The box of ${nameOf(i)} is now ${box.box.height} pixels high.`);
        });
        fit.append(sentence, " ", make);
        fieldset.append(fit);
      }

      const contrast = document.createElement("ul");
      contrast.id = `dr-${i}-contrast`;
      contrast.className = "dr-contrast";
      contrast.setAttribute("aria-label", `Contrast of ${nameOf(i)}`);
      fieldset.append(contrast);

      // Named styles: apply one, or save these colours as one.
      const styleRow = document.createElement("p");
      const apply = document.createElement("select");
      apply.id = `dr-${i}-style`;
      apply.setAttribute("aria-label", `Named style to apply to ${nameOf(i)}`);
      apply.append(new Option(styles.length ? "Choose a named style" : "No named styles yet", ""));
      for (const s of styles) apply.append(new Option(s.name, s.id));
      apply.disabled = styles.length === 0;
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.id = `dr-${i}-apply`;
      applyButton.textContent = "Apply the style";
      applyButton.setAttribute("aria-label", `Apply the chosen style to ${nameOf(i)}`);
      applyButton.addEventListener("click", () => {
        const style = styles.find((s) => s.id === apply.value);
        if (!style) { errorEl.textContent = "Choose a named style first."; apply.focus(); return; }
        clearErrors();
        takeRow(i);
        applyStyle(working[i], style);
        drawRows({ index: i, part: "apply" });
        drawPreview();
        say(`Style ${style.name} applied to ${nameOf(i)}.`);
      });
      const saveName = document.createElement("input");
      saveName.type = "text";
      saveName.id = `dr-${i}-stylename`;
      saveName.size = 18;
      saveName.autocomplete = "off";
      saveName.setAttribute("aria-label", `Name for a new style made from the colours of ${nameOf(i)}`);
      saveName.setAttribute("aria-describedby", "dr-error");
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.id = `dr-${i}-savestyle`;
      saveButton.textContent = "Save these colors as a style";
      saveButton.setAttribute("aria-label", `Save the colours of ${nameOf(i)} as a named style`);
      saveButton.addEventListener("click", () => {
        clearErrors();
        takeRow(i);
        const made = styleFromShape(working[i], saveName.value, styles);
        if (!made) {
          const checked = checkStyleName(saveName.value, styles);
          errorEl.textContent = `Problem with the style name: ${checked.ok ? "it cannot be used." : checked.message}`;
          saveName.setAttribute("aria-invalid", "true");
          saveName.focus();
          return;
        }
        styles.push(made);
        saveName.value = "";
        drawRows({ index: i, part: "stylename" });
        say(`Style ${made.name} saved. It can now be applied to other marks.`);
      });
      styleRow.append(apply, " ", applyButton, " ", saveName, " ", saveButton);
      fieldset.append(styleRow);

      // Order, delete.
      const actions = document.createElement("p");
      const button = (part: string, text: string, run: () => void, disabled = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.id = `dr-${i}-${part}`;
        b.textContent = text;
        b.disabled = disabled;
        b.setAttribute("aria-label", `${text}, ${nameOf(i)}`);
        b.addEventListener("click", run);
        actions.append(b, " ");
      };
      button("up", "Move towards the top", () => {
        working.forEach((_, j) => takeRow(j));
        if (i === working.length - 1) return;
        [working[i + 1], working[i]] = [working[i], working[i + 1]];
        drawRows({ index: i + 1, part: i + 1 === working.length - 1 ? "down" : "up" });
        say(`${kindName(working[i + 1].kind)} moved towards the top. It is now mark ${i + 2}.`);
      }, i === working.length - 1);
      button("down", "Move towards the bottom", () => {
        working.forEach((_, j) => takeRow(j));
        if (i === 0) return;
        [working[i - 1], working[i]] = [working[i], working[i - 1]];
        drawRows({ index: i - 1, part: i - 1 === 0 ? "up" : "down" });
        say(`${kindName(working[i - 1].kind)} moved towards the bottom. It is now mark ${i}.`);
      }, i === 0);
      button("delete", "Delete", () => {
        working.forEach((_, j) => takeRow(j));
        const gone = working.splice(i, 1)[0];
        activeId = working[Math.min(i, working.length - 1)]?.id ?? null;
        drawRows(working.length ? { index: Math.min(i, working.length - 1), part: "alt" } : undefined);
        if (!working.length) dialog.querySelector<HTMLElement>("#dr-add button")!.focus();
        say(`${kindName(gone.kind)} deleted. ${working.length} ${working.length === 1 ? "mark" : "marks"} left.`);
      });
      fieldset.append(actions);

      fieldset.addEventListener("input", () => { clearErrors(); takeRow(i); });
      fieldset.addEventListener("focusin", () => { if (working[i] && activeId !== working[i].id) setActive(working[i].id); });
      rowsEl.append(fieldset);
      renderFit(i);
      renderContrast(i);
    });
    if (focus) rowsEl.querySelector<HTMLElement>(`#dr-${focus.index}-${focus.part}`)?.focus();
    if (!current()) activeId = working.length ? working[0].id : null;
    markActive();
    mountHandles();
    drawPreview();
    renderStyles();
  }

  function markActive() {
    rowsEl.querySelectorAll("fieldset").forEach((fieldset, i) => {
      const on = working[i]?.id === activeId;
      fieldset.classList.toggle("co-active", on);
      fieldset.querySelector("legend")!.textContent = `Mark ${i + 1}: ${kindName(working[i].kind)}${on ? " (selected on the picture)" : ""}`;
    });
  }

  function setActive(id: string | null) {
    if (id === activeId && layer) return;
    activeId = id;
    markActive();
    mountHandles();
  }

  // ---- Handles on the sample -------------------------------------------------------------------------------------
  function mountHandles() {
    const box = previewBoxOf();
    if (!box) return;
    layer?.element.remove();
    layer = null;
    const shape = current();
    if (!shape) return;
    const slot = () => indexOf(activeId);
    const snapshot = () => { const before = copy(working[slot()]); return () => { working[slot()] = before; syncNumbers(slot()); drawPreview(); }; };
    const handleRadius = Math.max(10, markerRadius(size.width) * 0.6);
    const hits = working
      .map((other, i) => ({ other, i }))
      .filter(({ other }) => other.id !== shape.id)
      .map(({ other, i }) => {
        const b = shapeBounds(other);
        const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
        return {
          x, y, width: Math.max(1, Math.min(size.width, Math.round(b.x + b.width)) - x), height: Math.max(1, Math.min(size.height, Math.round(b.y + b.height)) - y),
          label: `Select mark ${i + 1}, ${kindName(other.kind).toLowerCase()}`,
          pick: () => { setActive(other.id); box.querySelector<HTMLElement>(".pointer-box, .pointer-marker")?.focus(); say(`Mark ${working.indexOf(other) + 1} is selected on the picture.`); },
        };
      });
    const base = { size, say, hits };
    const name = `${kindName(shape.kind)} ${slot() + 1}`;
    if (shape.kind === "arrow") {
      layer = createPointerLayer({
        ...base,
        extraPoints: [
          { label: `Tail of ${name}`, radius: handleRadius, get: () => ({ ...(working[slot()] as Extract<Shape, { kind: "arrow" }>).from }), set: (p) => { (working[slot()] as Extract<Shape, { kind: "arrow" }>).from = p; syncNumbers(slot()); drawPreview(); }, begin: snapshot },
          { label: `Head of ${name}`, radius: handleRadius, get: () => ({ ...(working[slot()] as Extract<Shape, { kind: "arrow" }>).to }), set: (p) => { (working[slot()] as Extract<Shape, { kind: "arrow" }>).to = p; syncNumbers(slot()); drawPreview(); }, begin: snapshot },
        ],
        lineDraw: {
          label: `${name} drawn`,
          begin: snapshot,
          set: (from, to) => { const a = working[slot()] as Extract<Shape, { kind: "arrow" }>; a.from = from; a.to = to; syncNumbers(slot()); drawPreview(); },
        },
      });
    } else if (shape.kind === "marker") {
      layer = createPointerLayer({
        ...base,
        point: {
          label: name, radius: shape.size,
          get: () => ({ ...(working[slot()] as Extract<Shape, { kind: "marker" }>).at }),
          set: (p) => { (working[slot()] as Extract<Shape, { kind: "marker" }>).at = p; syncNumbers(slot()); drawPreview(); },
          begin: snapshot,
        },
      });
    } else {
      layer = createPointerLayer({
        ...base,
        box: {
          label: `${name} outline`,
          get: () => ({ ...(working[slot()] as Extract<Shape, { kind: "text" | "rectangle" }>).box }),
          set: (b) => { (working[slot()] as Extract<Shape, { kind: "text" | "rectangle" }>).box = { ...b }; syncNumbers(slot()); drawPreview(); },
          begin: snapshot,
        },
      });
    }
    box.append(layer.element);
    drawPreview();
  }

  // ---- Named styles -------------------------------------------------------------------------------------------------
  function renderStyles() {
    dialog.querySelector("#dr-styles-help")!.textContent = styles.length
      ? "A named style is a set of colours saved under a name, such as Warning (a red box with white lettering). Applying one copies its colours onto a mark. The contrast of a style's own colours is checked too."
      : "A named style is a set of colours saved under a name, such as Warning (a red box with white lettering). There are none yet: set the colours of a mark, give a name in its group and press Save these colors as a style.";
    stylesEl.replaceChildren();
    styles.forEach((style) => {
      const li = document.createElement("li");
      li.className = "comment";
      const title = document.createElement("h4");
      title.textContent = style.name;
      const words = document.createElement("p");
      words.className = "help";
      words.textContent = `Fill ${style.fill ?? "none"}, outline ${style.outline}, text ${style.textColor}.`;
      li.append(title, words);
      for (const check of styleChecks(style)) {
        const p = document.createElement("p");
        p.textContent = `${check.ok ? "✓" : "⚠"} ${check.words}`;
        li.append(p);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete the style";
      remove.setAttribute("aria-label", `Delete the style ${style.name}`);
      remove.addEventListener("click", () => {
        styles.splice(styles.indexOf(style), 1);
        working.forEach((_, j) => takeRow(j));
        drawRows();
        say(`Style ${style.name} deleted. The marks that used its colours keep them.`);
      });
      li.append(remove);
      stylesEl.append(li);
    });
  }

  // ---- Adding marks ------------------------------------------------------------------------------------------------------
  const addEl = dialog.querySelector<HTMLElement>("#dr-add")!;
  for (const kind of SHAPE_KINDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Add ${kind.id === "arrow" ? "an" : "a"} ${kind.name.toLowerCase()}`;
    button.addEventListener("click", () => {
      clearErrors();
      working.forEach((_, j) => takeRow(j));
      const made = newShape(kind.id as ShapeKind, size);
      if (made.kind === "marker") made.label = String(working.filter((s) => s.kind === "marker").length + 1).slice(0, 3);
      working.push(made);
      activeId = made.id;
      drawRows({ index: working.length - 1, part: SHAPE_FIELDS[made.kind][0].field });
      say(`${kind.name} added as mark ${working.length}. Place it with the numbers or on the picture, and describe it.`);
    });
    addEl.append(button, " ");
  }

  // ---- Save and cancel -------------------------------------------------------------------------------------------------
  let result: DrawingResult | null = null;
  dialog.querySelector<HTMLFormElement>("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if ((event.submitter as HTMLButtonElement | null)?.value === "cancel") return dialog.close("cancel");
    clearErrors();
    const next: Shape[] = [];
    for (let i = 0; i < working.length; i++) {
      const checked = checkShapeInput(working[i], inputOf(i), size);
      if (!checked.ok) {
        setActive(working[i].id);
        const box = field(i, checked.field);
        box?.setAttribute("aria-invalid", "true");
        errorEl.textContent = `Problem in mark ${i + 1}, ${kindName(working[i].kind).toLowerCase()}: ${checked.message}`;
        box?.focus();
        return;
      }
      const shape = checked.shape;
      // A mark saved with colours below the minimum keeps a record that the author saw the warning and kept them.
      const bad = failing(shapeChecks(shape, backdrop ? backdrop.behind(shape) : null)).length > 0;
      if (bad) shape.keptLowContrast = true; else delete shape.keptLowContrast;
      next.push(shape);
    }
    result = { shapes: next, styles };
    dialog.close("ok");
  });

  drawRows();
  if (imageUrl) {
    void loadBackdrop(imageUrl, picture.width, picture.height).then((found) => {
      backdrop = found;
      working.forEach((_, i) => renderContrast(i));
    });
  }
  const first = working.length ? rowsEl.querySelector<HTMLElement>(`#dr-0-${SHAPE_FIELDS[working[0].kind][0].field}`) : null;
  await open(dialog, first ?? (addEl.querySelector("button") as HTMLElement));
  return dialog.returnValue === "ok" ? result : null;
}
