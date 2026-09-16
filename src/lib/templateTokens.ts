// Pure string helper — no server imports — so client components (the
// template picker in the compose forms) can import it without pulling
// Prisma into the browser bundle.
export function applyTemplateTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}
