// A small reader for the XML inside a Word file (and an XLIFF file). It reads elements, their attributes and their text, with the five named entities and numeric ones, and skips comments, the XML
// declaration, processing instructions and a DOCTYPE. It does not check the document against any rules and it keeps a prefix as it is written (`w:p`). A broken document is refused with a plain
// message. It needs no screen and no browser, so it is tested on its own and works the same in the app and in a test.

export interface XmlNode {
  /** The element's name with its prefix, such as `w:p`; a piece of text is `#text`. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** For `#text`: the words. */
  text?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The words with entities such as `&amp;`, `&#65;` and `&#x41;` turned into their letters. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Reads a document and returns its root element. */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = source.length;
  const fail = (why: string): never => { throw new Error(`The XML is damaged (${why}), so it could not be read.`); };
  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt < 0) { pushText(stack[stack.length - 1], source.slice(i)); break; }
    if (lt > i) pushText(stack[stack.length - 1], source.slice(i, lt));
    if (source.startsWith("<!--", lt)) { const end = source.indexOf("-->", lt + 4); if (end < 0) fail("a comment is not closed"); i = end + 3; continue; }
    if (source.startsWith("<![CDATA[", lt)) { const end = source.indexOf("]]>", lt + 9); if (end < 0) fail("a CDATA section is not closed"); stack[stack.length - 1].children.push({ name: "#text", attrs: {}, children: [], text: source.slice(lt + 9, end) }); i = end + 3; continue; }
    if (source.startsWith("<?", lt)) { const end = source.indexOf("?>", lt + 2); if (end < 0) fail("an instruction is not closed"); i = end + 2; continue; }
    if (source.startsWith("<!", lt)) { const end = source.indexOf(">", lt + 2); if (end < 0) fail("a declaration is not closed"); i = end + 1; continue; }
    if (source[lt + 1] === "/") {
      const end = source.indexOf(">", lt + 2);
      if (end < 0) fail("a closing tag is not finished");
      const name = source.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name === "#root" || open.name !== name) fail(`</${name}> does not match`);
      i = end + 1;
      continue;
    }
    // An opening tag: find its end, skipping quoted attribute values (which may hold a >).
    let j = lt + 1;
    let quote = "";
    while (j < n) {
      const c = source[j];
      if (quote) { if (c === quote) quote = ""; } else if (c === '"' || c === "'") quote = c; else if (c === ">") break;
      j++;
    }
    if (j >= n) fail("a tag is not finished");
    let body = source.slice(lt + 1, j);
    const selfClosing = body.endsWith("/");
    if (selfClosing) body = body.slice(0, -1);
    const nameEnd = body.search(/\s/);
    const name = nameEnd < 0 ? body : body.slice(0, nameEnd);
    if (!name) fail("a tag has no name");
    const node: XmlNode = { name, attrs: {}, children: [] };
    const attrSource = nameEnd < 0 ? "" : body.slice(nameEnd);
    for (const m of attrSource.matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = j + 1;
  }
  if (stack.length !== 1) fail(`<${stack[stack.length - 1].name}> is not closed`);
  const element = root.children.find((c) => c.name !== "#text");
  if (!element) fail("there is no element");
  return element!;
}

function pushText(into: XmlNode, raw: string): void {
  if (raw === "") return;
  into.children.push({ name: "#text", attrs: {}, children: [], text: decodeEntities(raw) });
}

/** The child elements with this name. */
export const childrenNamed = (node: XmlNode | undefined, name: string): XmlNode[] => (node ? node.children.filter((c) => c.name === name) : []);
/** The first child element with this name. */
export const childNamed = (node: XmlNode | undefined, name: string): XmlNode | undefined => (node ? node.children.find((c) => c.name === name) : undefined);
/** Every descendant element with this name, in document order. */
export function descendantsNamed(node: XmlNode, name: string, into: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.name === name) into.push(c);
    descendantsNamed(c, name, into);
  }
  return into;
}
/** All the text under a node, joined. */
export function textOf(node: XmlNode): string {
  return node.name === "#text" ? node.text ?? "" : node.children.map(textOf).join("");
}
