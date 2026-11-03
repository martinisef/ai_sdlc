// The to-do list lives in a JSON file: [{ "id": 1, "text": "buy milk" }, …]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function load(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function save(file, todos) {
  writeFileSync(file, JSON.stringify(todos, null, 2) + '\n');
}

export function add(todos, text) {
  const clean = text.trim();
  if (!clean) throw new Error('a to-do needs some text');
  const id = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  return [...todos, { id, text: clean }];
}

export function format(todos) {
  if (!todos.length) return 'Nothing to do.';
  return todos.map((t) => `${t.id}. ${t.text}`).join('\n');
}
