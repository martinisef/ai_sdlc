#!/usr/bin/env node
// Usage: node src/cli.js add "buy milk" | node src/cli.js list
import { add, format, load, save } from './todos.js';

const FILE = process.env.TODO_FILE ?? 'todos.json';
const [command, ...rest] = process.argv.slice(2);

if (command === 'add') {
  save(FILE, add(load(FILE), rest.join(' ')));
  console.log('Added.');
} else if (command === 'list' || command === undefined) {
  console.log(format(load(FILE)));
} else {
  console.error(`unknown command: ${command} (try: add "<text>", list)`);
  process.exit(1);
}
