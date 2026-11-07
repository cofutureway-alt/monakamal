// Plain text → the TipTap JSON document shape stored in quiz_questions.content
// and quiz_question_options.content (verified against existing rows:
// {type:"doc", content:[{type:"paragraph", content:[{type:"text", text}]}]}).
// Blank lines split paragraphs; an empty paragraph has no `content` key.

export interface RichDoc {
  type: "doc";
  content: { type: "paragraph"; content?: { type: "text"; text: string }[] }[];
}

export function textToRichDoc(text: string): RichDoc {
  const paragraphs = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}|\n/)
    .map((p) => p.trim());
  const content = (paragraphs.length ? paragraphs : [""]).map((p) =>
    p ? { type: "paragraph" as const, content: [{ type: "text" as const, text: p }] } : { type: "paragraph" as const }
  );
  return { type: "doc", content };
}

/** Reverse, for previews: concatenated text of a stored doc (math nodes → their latex). */
// deno-lint-ignore no-explicit-any
export function richDocToText(doc: any): string {
  if (!doc || typeof doc !== "object") return "";
  // deno-lint-ignore no-explicit-any
  const walk = (n: any): string => {
    if (!n) return "";
    if (n.type === "text") return String(n.text ?? "");
    if (n.type === "inlineMath") return String(n.attrs?.latex ?? "");
    const inner = Array.isArray(n.content) ? n.content.map(walk).join("") : "";
    return n.type === "paragraph" ? `${inner}\n` : inner;
  };
  return walk(doc).trim();
}
