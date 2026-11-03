import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add, done, format } from '../src/todos.js';

test('add gives each to-do the next id', () => {
  const todos = add(add([], 'buy milk'), 'call mum');
  assert.deepEqual(todos, [{ id: 1, text: 'buy milk' }, { id: 2, text: 'call mum' }]);
});

test('add refuses an empty to-do', () => {
  assert.throws(() => add([], '   '), /needs some text/);
});

test('format lists the to-dos with a box, or says there is nothing to do', () => {
  assert.equal(format([]), 'Nothing to do.');
  assert.equal(format([{ id: 1, text: 'buy milk' }]), '1. [ ] buy milk\n(1 to-dos)');
});

test('R1: done marks the to-do', () => {
  assert.deepEqual(done([{ id: 1, text: 'a' }, { id: 2, text: 'b' }], 2), [{ id: 1, text: 'a' }, { id: 2, text: 'b', done: true }]);
});

test('R2: done with an unknown id throws', () => {
  assert.throws(() => done([], 7), /no to-do with id 7/);
});

test('R3 and R4: format ticks done to-dos; a missing done field means not done', () => {
  assert.equal(format([{ id: 1, text: 'a', done: true }, { id: 2, text: 'b' }]), '1. [x] a\n2. [ ] b\n(2 to-dos)');
});
