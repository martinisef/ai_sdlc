import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add, allocate, format, money, MoneyError, parse, subtract } from '../src/index.ts';

test('parse respects each currency minor units', () => {
  assert.equal(parse('12.3', 'USD').amount, 1230n);
  assert.equal(parse('-0.05', 'EUR').amount, -5n);
  assert.equal(parse('500', 'JPY').amount, 500n);
  assert.equal(parse('1.250', 'KWD').amount, 1250n);
  assert.throws(() => parse('1.234', 'USD'), MoneyError);
  assert.throws(() => parse('abc', 'USD'), MoneyError);
  assert.throws(() => parse('1', 'XYZ'), MoneyError);
});

test('arithmetic is exact and refuses mixed currencies', () => {
  assert.equal(add(parse('0.1', 'USD'), parse('0.2', 'USD')).amount, 30n);
  assert.equal(subtract(money(100, 'USD'), money(250, 'USD')).amount, -150n);
  assert.throws(() => add(money(1, 'USD'), money(1, 'EUR')), /currency mismatch/);
  assert.throws(() => money(1.5, 'USD'), MoneyError);
});

test('allocate never loses a minor unit', () => {
  assert.deepEqual(allocate(money(100, 'USD'), [1, 1, 1]).map((m) => m.amount), [34n, 33n, 33n]);
  assert.deepEqual(allocate(money(5, 'USD'), [3, 7]).map((m) => m.amount), [2n, 3n]);
  assert.throws(() => allocate(money(5, 'USD'), [0, 0]), MoneyError);
  assert.throws(() => allocate(money(5, 'USD'), []), MoneyError);
});

test('format', () => {
  assert.equal(format(money(1230, 'USD')), '$12.30');
  assert.equal(format(money(-5, 'EUR')), '-€0.05');
  assert.equal(format(money(500, 'JPY')), '¥500');
  assert.equal(format(money(1250, 'KWD')), 'KD1.250');
});
