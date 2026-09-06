import { Fragment } from "react";

// Small, dependency-free formatter for lesson bodies: blank-line-separated
// paragraphs, "- " lines become a bullet list (even a label line
// immediately followed by bullets, no blank line needed), **text**
// becomes bold. Plain content with no blank lines/bullets renders just
// like the old whitespace-pre-line behavior (a single paragraph, single
// "\n" as <br/>).
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

interface Group {
  type: "p" | "ul";
  lines: string[];
}

function groupLines(lines: string[]): Group[] {
  const groups: Group[] = [];
  for (const line of lines) {
    const isBullet = line.startsWith("- ");
    const last = groups[groups.length - 1];
    if (last && last.type === (isBullet ? "ul" : "p")) {
      last.lines.push(line);
    } else {
      groups.push({ type: isBullet ? "ul" : "p", lines: [line] });
    }
  }
  return groups;
}

export default function LessonContent({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);

  return (
    <div className="space-y-3 text-sm text-neutral-700">
      {blocks.map((block, bi) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return null;

        return groupLines(lines).map((group, gi) => {
          const key = `${bi}-${gi}`;
          if (group.type === "ul") {
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {group.lines.map((l, li) => (
                  <li key={li}>{renderInline(l.slice(2), `${key}-${li}`)}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={key}>
              {group.lines.map((line, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {renderInline(line, `${key}-${li}`)}
                </Fragment>
              ))}
            </p>
          );
        });
      })}
    </div>
  );
}
