// Minimal frontmatter reader/writer for the loop artifacts (intent.md, spec.md, plan.md).
// Values are flat `key: value` lines; a trailing ` # comment` (as in the templates) is not part of the value.

export interface Parsed {
  data: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
}

function stripComment(v: string): string {
  return v.replace(/\s+#.*$/, '').trim();
}

export function parseFrontmatter(text: string): Parsed {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { data: {}, body: text, hasFrontmatter: false };
  const data: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === '---') break;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!(key in data)) data[key] = stripComment(line.slice(idx + 1));
  }
  return { data, body: lines.slice(i + 1).join('\n'), hasFrontmatter: true };
}

/** Set (or add) frontmatter fields, keeping the rest of the file and the inline comments intact. */
export function setFrontmatter(text: string, fields: Record<string, string>): string {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== '---') {
    const head = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
    return ['---', ...head, '---', text].join('\n');
  }
  let end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end === -1) end = lines.length;
  const pending = new Map(Object.entries(fields));
  for (let i = 1; i < end; i++) {
    const m = /^([^:#]+):(\s*)(.*?)(\s+#.*)?$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1].trim();
    if (!pending.has(key)) continue;
    const prefix = `${key}: ${pending.get(key)}`;
    if (m[4]) {
      // keep the comment at its original column when there is room
      const col = lines[i].length - m[4].trimStart().length;
      lines[i] = prefix.padEnd(Math.max(prefix.length + 1, col)) + m[4].trimStart();
    } else {
      lines[i] = prefix;
    }
    pending.delete(key);
  }
  const added = [...pending].map(([k, v]) => `${k}: ${v}`);
  lines.splice(end, 0, ...added);
  return lines.join('\n');
}
