import { CURRENCIES, type CurrencyCode } from './gen/currencies.generated.ts';

/** An amount in minor units (cents for USD), so arithmetic is exact. */
export interface Money {
  readonly amount: bigint;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {}

export function isCurrency(code: string): code is CurrencyCode {
  return Object.hasOwn(CURRENCIES, code);
}

export function money(amount: bigint | number, currency: string): Money {
  if (!isCurrency(currency)) throw new MoneyError(`unsupported currency: ${currency}`);
  if (typeof amount === 'number' && !Number.isSafeInteger(amount)) throw new MoneyError(`amount must be an integer number of minor units: ${amount}`);
  return { amount: BigInt(amount), currency };
}

/** Parse a decimal string ("12.30") into minor units, rejecting excess precision. */
export function parse(text: string, currency: string): Money {
  if (!isCurrency(currency)) throw new MoneyError(`unsupported currency: ${currency}`);
  const units = CURRENCIES[currency].minorUnits;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new MoneyError(`not a decimal amount: ${text}`);
  const [, sign, whole, frac = ''] = m;
  if (frac.length > units) throw new MoneyError(`${currency} has ${units} decimal places: ${text}`);
  const minor = BigInt(whole! + frac.padEnd(units, '0'));
  return { amount: sign ? -minor : minor, currency };
}

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new MoneyError(`currency mismatch: ${a.currency} vs ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

/**
 * Split `m` by integer ratios without losing a single minor unit: the remainder goes to the first shares.
 * allocate(money(100, 'USD'), [1, 1, 1]) → 34, 33, 33.
 */
export function allocate(m: Money, ratios: number[]): Money[] {
  if (!ratios.length || ratios.some((r) => !Number.isInteger(r) || r < 0)) throw new MoneyError('ratios must be non-negative integers');
  const total = ratios.reduce((a, b) => a + b, 0);
  if (total === 0) throw new MoneyError('ratios must not all be zero');
  const shares = ratios.map((r) => (m.amount * BigInt(r)) / BigInt(total));
  let remainder = m.amount - shares.reduce((a, b) => a + b, 0n);
  for (let i = 0; remainder > 0n; i = (i + 1) % shares.length, remainder--) shares[i]! += 1n;
  return shares.map((amount) => ({ amount, currency: m.currency }));
}

/** "$12.30", "-¥5", "KD1.250". */
export function format(m: Money): string {
  const { minorUnits, symbol } = CURRENCIES[m.currency];
  const negative = m.amount < 0n;
  const digits = (negative ? -m.amount : m.amount).toString().padStart(minorUnits + 1, '0');
  const whole = minorUnits ? digits.slice(0, -minorUnits) : digits;
  const frac = minorUnits ? `.${digits.slice(-minorUnits)}` : '';
  return `${negative ? '-' : ''}${symbol}${whole}${frac}`;
}
