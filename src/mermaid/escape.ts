/** Quoted Mermaid labels use decimal entities, not HTML entities. Only our
 * generated line breaks may introduce markup; encode Markdown syntax as well.
 */
export function escapeLabel(value: string): string {
  return value.replace(/\r\n?|\n|[^\p{L}\p{N} ./_-]/gu, (character) => {
    if (character === "\n" || character === "\r" || character === "\r\n") return "<br/>";
    return `#${character.codePointAt(0)!};`;
  });
}
