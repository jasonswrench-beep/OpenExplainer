// Every key OpenExplainer has, in groups, for the Keyboard keys window (Help > Keyboard keys, Ctrl+/). The paragraphs that used to
// explain the keys under each pane are here instead (they stay in the page for screen readers, which read them with the list they
// belong to). A group can be listed first, for the part of the window the author was in.

export interface KeyRow {
  keys: string;
  does: string;
}

export interface KeyGroup {
  id: string;
  title: string;
  rows: KeyRow[];
}

export const KEY_GROUPS: KeyGroup[] = [
  {
    id: "anywhere",
    title: "Anywhere",
    rows: [
      { keys: "Ctrl+K", does: "Search for a command by its name" },
      { keys: "Ctrl+/", does: "This list of keys" },
      { keys: "F10, or Alt pressed and let go on its own", does: "Go to the menus, and pressed again, back to where you were" },
      { keys: "F6, Shift+F6", does: "Go to the next or the previous pane: chapters and topics, the page, the properties" },
      { keys: "Ctrl+S", does: "Save" },
    ],
  },
  {
    id: "tree",
    title: "The list of chapters and topics",
    rows: [
      { keys: "Up, Down", does: "Move through the list" },
      { keys: "Right, Left", does: "Open or close a chapter; Left on a topic goes to the chapter it is in" },
      { keys: "Home, End", does: "The first or the last in the list" },
      { keys: "F2", does: "Rename" },
      { keys: "Delete", does: "Delete, with what is under it" },
      { keys: "Alt+Up, Alt+Down", does: "Move it up or down" },
      { keys: "Alt+Right, Alt+Left", does: "Indent or outdent it" },
    ],
  },
  {
    id: "menus",
    title: "Menus, and the Add and ... buttons",
    rows: [
      { keys: "Down, Enter or Space", does: "Open the menu on its first item" },
      { keys: "Up", does: "Open the menu on its last item" },
      { keys: "Up, Down, Home, End", does: "Move in a menu" },
      { keys: "A letter", does: "The next item that starts with it" },
      { keys: "Left, Right", does: "In the menus under the top bar: the menu beside it" },
      { keys: "Escape, Tab", does: "Close the menu and go back to where it was opened from" },
    ],
  },
  {
    id: "page",
    title: "The page",
    rows: [
      { keys: "Left, Right, Home, End", does: "On the row of views: Edit, Print preview, Help site preview, Guide preview" },
      { keys: "Tab", does: "Through the blocks and their buttons, in order" },
    ],
  },
  {
    id: "search",
    title: "Search for a command (Ctrl+K)",
    rows: [
      { keys: "Type", does: "Find the commands whose names have those words" },
      { keys: "Up, Down, Page Up, Page Down", does: "Move through what is found" },
      { keys: "Enter", does: "Do the command" },
      { keys: "Escape", does: "Close the search" },
    ],
  },
  {
    id: "dialogs",
    title: "Dialogs",
    rows: [
      { keys: "Tab, Shift+Tab", does: "Move through the dialog; from the last control back to the first" },
      { keys: "Escape", does: "Close the dialog without changing anything" },
    ],
  },
];

/** The groups, with the one for `first` (if there is one) at the top and the rest in their order. */
export function keyGroupsFirst(first?: string): KeyGroup[] {
  const at = KEY_GROUPS.findIndex((g) => g.id === first);
  return at <= 0 ? [...KEY_GROUPS] : [KEY_GROUPS[at], ...KEY_GROUPS.slice(0, at), ...KEY_GROUPS.slice(at + 1)];
}
