import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add, format } from '../src/todos.js';

test('add gives each to-do the next id', () => {
  const todos = add(add([], 'buy milk'), 'call mum');
  assert.deepEqual(todos, [{ id: 1, text: 'buy milk' }, { id: 2, text: 'call mum' }]);
});

test('add refuses an empty to-do', () => {
  assert.throws(() => add([], '   '), /needs some text/);
});

test('format lists the to-dos, or says there is nothing to do', () => {
  assert.equal(format([]), 'Nothing to do.');
  assert.equal(format([{ id: 1, text: 'buy milk' }]), '1. buy milk');
});
