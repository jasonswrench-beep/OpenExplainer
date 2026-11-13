// Every command OpenExplainer has, in one list: what it says, its icon, its shortcut and what it is for. The row of menus under the
// navy bar, the buttons of the panes, the right-click menus and the command search (Ctrl+K) all take their words from here, so a
// command says the same thing wherever it is. What each one does is wired up in main.ts, by its id (the ids are the ones the old
// buttons had, so the rest of the program still finds them).
// The look follows the OpenStage suite's design guide (copied from OpenStage Author with its menus; see NOTICE).

import type { UiIconName } from "./uiicons.gen.ts";

export interface CommandWords {
  label: string;
  icon: UiIconName;
  /** The shortcut, written the way it is shown, for example "Ctrl+S". */
  keys?: string;
  /** A longer description, shown when the pointer rests on it and searched by Ctrl+K. */
  title: string;
}

export const COMMANDS = {
  // File
  "b-new": { label: "New project...", icon: "file-plus", title: "Start a new project, with nothing in it" },
  "b-open": { label: "Open project...", icon: "folder-open", title: "Open a project file (.openexplainer)" },
  "b-save": { label: "Save", icon: "save", keys: "Ctrl+S", title: "Save the project to its file" },
  "b-saveas": { label: "Save as...", icon: "save-all", title: "Save the project to a new file" },
  "b-import-export": { label: "Import an export...", icon: "package-open", title: "Bring back a JSON export made by OpenExplainer, as a project" },
  "b-import-word": { label: "Import from Word...", icon: "file-input", title: "Bring in the headings, text, steps and pictures of a Word document" },
  "b-review-in": { label: "Bring in review comments...", icon: "message-square-plus", title: "Bring in the comments reviewers wrote in a Word review copy" },
  "b-import-translation": { label: "Import a translation...", icon: "languages", title: "Make a translated copy of the book from a translation file (XLIFF)" },
  "b-export": { label: "Export...", icon: "file-output", title: "Make the book or a guide as PDF or Word, or a help site, JSON or Markdown" },
  "b-history": { label: "History...", icon: "clock", title: "Snapshots of the project: keep one, go back to one" },
  // Chapters and topics
  "b-chapter": { label: "Add chapter", icon: "folder-plus", title: "Add a chapter at the end of the book" },
  "b-topic": { label: "Add topic under selected", icon: "list-plus", title: "Add a topic under the chapter or topic that is selected" },
  "b-rename": { label: "Rename", icon: "pencil", keys: "F2", title: "Rename the selected chapter or topic" },
  "b-up": { label: "Move up", icon: "arrow-up", keys: "Alt+Up", title: "Move the selected chapter or topic up (in the list: Alt+Up)" },
  "b-down": { label: "Move down", icon: "arrow-down", keys: "Alt+Down", title: "Move the selected chapter or topic down (in the list: Alt+Down)" },
  "b-indent": { label: "Indent", icon: "list-indent-increase", keys: "Alt+Right", title: "Make the selected item a topic of the one above it (in the list: Alt+Right)" },
  "b-outdent": { label: "Outdent", icon: "list-indent-decrease", keys: "Alt+Left", title: "Move the selected topic out one level (in the list: Alt+Left)" },
  "b-find": { label: "Find and replace in titles...", icon: "replace", title: "Find words in the chapter and topic titles, and replace them" },
  "b-delete": { label: "Delete", icon: "trash", keys: "Delete", title: "Delete the selected chapter or topic, with everything under it" },
  // Insert
  "b-import": { label: "Import pictures...", icon: "image-plus", title: "Add PNG or JPEG pictures to the selected chapter or topic" },
  "b-capture": { label: "Capture...", icon: "camera", title: "Capture a window, a part of the screen, or click by click, into the selected chapter or topic" },
  "add-paragraph": { label: "Paragraph", icon: "pilcrow", title: "Add a paragraph to the page, after the block you were last in" },
  "add-heading": { label: "Heading", icon: "heading", title: "Add a heading to the page" },
  "add-picture": { label: "Picture", icon: "image", title: "Add one of the topic's pictures to the page" },
  "add-procedure": { label: "Numbered procedure", icon: "list-ordered", title: "Add numbered steps to the page" },
  "add-callout": { label: "Callout box", icon: "message-square-text", title: "Add a boxed note to the page: Design Tip, Caution and the rest" },
  "add-snippet": { label: "Snippet", icon: "text-quote", title: "Add a piece of text kept once and used in several places (Reuse)" },
  // Write
  "b-drafts": { label: "Drafts...", icon: "inbox", title: "The drafts waiting for you: accept or reject each one" },
  "b-draft-topic": { label: "Draft callout text for this topic", icon: "wand-sparkles", title: "Have the AI write a sentence for each callout of this topic that has none" },
  "b-procedure": { label: "Draft a procedure from the clicks", icon: "list-checks", title: "Make numbered steps from this topic's click pictures (no AI needed)" },
  "b-opener": { label: "Draft an opener for this chapter", icon: "book-open-text", title: "Have the AI write two or three sentences for the top of this chapter" },
  "b-summary": { label: "Draft a chapter summary here", icon: "text-align-start", title: "Have the AI write a summary of the chapter's topics, for this topic" },
  "b-boxes": { label: "Suggest boxed notes for this topic", icon: "message-square-plus", title: "Have the AI suggest up to three boxed notes, each resting on a sentence the topic already says" },
  "b-style": { label: "Writing style...", icon: "pen-line", title: "Notes for the AI about how the book should read, and words to avoid" },
  // Book
  "b-vars": { label: "Project variables...", icon: "variable", title: "Names such as the product's name, written once and used everywhere" },
  "b-look": { label: "Look of the book...", icon: "palette", title: "Fonts, colours, the page and the title page of the book" },
  "b-reuse": { label: "Reuse...", icon: "recycle", title: "Snippets kept once, and conditions that leave parts out of an output" },
  "b-index": { label: "Index...", icon: "book-a", title: "The book's index: the terms, where they are, and updating them" },
  "b-guides": { label: "Guides...", icon: "book-open-check", title: "Short step-by-step guides made from topics already in the book" },
  "b-highlight": { label: "Click circle settings...", icon: "circle-dot", title: "The circle on the clicked spot: on or off, its size, colour and how see-through" },
  "b-zoom": { label: "Zoom settings...", icon: "zoom-in", title: "How close a picture zoomed in on its click goes, and zooming small pictures for print" },
  // Review
  "b-check": { label: "Check the book...", icon: "clipboard-check", title: "An optional check before you export: pictures with no description, low contrast and more" },
  "b-unresolved": { label: "Unresolved comments...", icon: "messages-square", title: "The comments in the book that are still open" },
  // View
  "view-edit": { label: "Edit", icon: "pencil-line", title: "Write the page" },
  "view-print": { label: "Print preview", icon: "printer", title: "See the whole book as it will print" },
  "view-help": { label: "Help site preview", icon: "globe", title: "See the page as it will be on the help site" },
  "view-guide": { label: "Guide preview", icon: "book-open", title: "See a guide as it will be" },
  // Tools
  "b-ai": { label: "AI help...", icon: "sparkles", title: "Who drafts text for you: nobody, or a small AI model that runs on this PC" },
  "b-mcp": { label: "MCP access...", icon: "plug", title: "Let an AI assistant use OpenExplainer, inside a folder you name" },
  // Help
  "cmd-search": { label: "Search for a command", icon: "search", keys: "Ctrl+K", title: "Find any command by its name" },
  "cmd-keys": { label: "Keyboard keys", icon: "keyboard", keys: "Ctrl+/", title: "Every key OpenExplainer has" },
  "cmd-updates": { label: "Check for updates...", icon: "globe", title: "Ask, once, whether a newer OpenExplainer is published (nothing is installed)" },
} as const satisfies Record<string, CommandWords>;

export type CommandId = keyof typeof COMMANDS;

export type MenuItemId = CommandId | "-";

/** The row of menus, in order, with what each holds. */
export const MENUS: readonly { id: string; label: string; items: readonly MenuItemId[] }[] = [
  { id: "file", label: "File", items: ["b-new", "b-open", "b-save", "b-saveas", "-", "b-import-export", "b-import-word", "b-review-in", "b-import-translation", "-", "b-export", "b-history"] },
  { id: "chapters", label: "Chapters", items: ["b-chapter", "b-topic", "-", "b-rename", "b-up", "b-down", "b-indent", "b-outdent", "-", "b-find", "-", "b-delete"] },
  { id: "insert", label: "Insert", items: ["b-import", "b-capture", "-", "add-paragraph", "add-heading", "add-picture", "add-procedure", "add-callout", "add-snippet"] },
  { id: "write", label: "Write", items: ["b-drafts", "-", "b-draft-topic", "b-procedure", "b-opener", "b-summary", "b-boxes", "-", "b-style"] },
  { id: "book", label: "Book", items: ["b-vars", "b-look", "b-reuse", "-", "b-index", "b-guides", "-", "b-highlight", "b-zoom"] },
  { id: "view", label: "View", items: ["view-edit", "view-print", "view-help", "view-guide"] },
  { id: "review", label: "Review", items: ["b-check", "b-unresolved", "b-drafts"] },
  { id: "tools", label: "Tools", items: ["b-ai", "b-mcp"] },
  { id: "help", label: "Help", items: ["cmd-search", "cmd-keys", "cmd-updates"] },
];

/** The buttons in the navy bar: the few things done all the time. The last one is filled in the product colour. */
export const BAR_BUTTONS: readonly { id: CommandId; word: string }[] = [
  { id: "b-save", word: "Save" },
  { id: "b-capture", word: "Capture" },
  { id: "b-check", word: "Check" },
  { id: "b-export", word: "Export" },
];

/** The panes' Add and "..." menus. */
export const PANE_MENUS = {
  treeAdd: ["b-chapter", "b-topic"],
  treeMore: ["b-rename", "b-up", "b-down", "b-indent", "b-outdent", "-", "b-find", "-", "b-delete"],
  pageAdd: ["add-paragraph", "add-heading", "add-picture", "add-procedure", "add-callout", "add-snippet"],
  pageMore: ["b-unresolved", "-", "b-opener", "b-summary", "b-boxes"],
  picturesAdd: ["b-import", "b-capture"],
  picturesMore: ["b-draft-topic", "b-procedure", "-", "b-highlight", "b-zoom"],
} as const satisfies Record<string, readonly MenuItemId[]>;

/** Every icon the commands and the window use, for making the icon file. */
export function iconsUsed(): UiIconName[] {
  return [...new Set(Object.values(COMMANDS).map((c) => c.icon))];
}
