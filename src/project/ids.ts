// New ids for chapters, topics, pictures and the blocks of a page. An id is permanent: everything else points at a thing by its id.

export function newId(): string {
  return "n" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
