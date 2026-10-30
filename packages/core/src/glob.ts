// Glob semantics shared by every guardrail (same as the original bash `[[ path == glob ]]`):
// `*` also crosses `/`, `?` is one character, `[...]` is a class, and a leading `**/` is optional.

const cache = new Map<string, RegExp>();

function toRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      while (glob[i + 1] === '*') i++;
      re += '.*';
    } else if (c === '?') {
      re += '.';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end === -1) {
        re += '\\[';
      } else {
        let cls = glob.slice(i + 1, end);
        if (cls.startsWith('!')) cls = '^' + cls.slice(1);
        re += '[' + cls.replace(/\\/g, '\\\\') + ']';
        i = end;
      }
    } else {
      re += c.replace(/[.+^${}()|\\/]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$', 's');
}

function compiled(glob: string): RegExp {
  let r = cache.get(glob);
  if (!r) {
    r = toRegExp(glob);
    cache.set(glob, r);
  }
  return r;
}

export function globMatch(path: string, glob: string): boolean {
  if (compiled(glob).test(path)) return true;
  return glob.startsWith('**/') && compiled(glob.slice(3)).test(path);
}

/** First glob in the list that matches the path, if any. */
export function matchAny(path: string, globs: readonly string[] | undefined): string | undefined {
  return (globs ?? []).find((g) => g && globMatch(path, g));
}
