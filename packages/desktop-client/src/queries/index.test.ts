import { q } from '@actual-app/core/shared/query';
import { describe, expect, it } from 'vitest';

import { transactionsSearch } from '.';

describe('transactionsSearch', () => {
  function searchesAmount(search: string) {
    const query = transactionsSearch(q('transactions'), search, 'MM/dd/yyyy');
    return JSON.stringify(query.state.filterExpressions).includes('"amount"');
  }

  it.each(['1password', '7eleven', '3M', 'Route 66', 'Fr. 5 off'])(
    'does not treat %s as an amount search',
    search => {
      expect(searchesAmount(search)).toBe(false);
    },
  );

  it.each([
    '1',
    '12.34',
    '-5',
    '$1,000.00',
    '-$5',
    '12,50 kr',
    '100 Kč',
    'zł 9,99',
    "CHF 1'000.50",
    'Rs. 500',
    '₹500',
    '5 د.إ',
  ])('treats %s as an amount search', search => {
    expect(searchesAmount(search)).toBe(true);
  });

  it('matches the absolute amount for a negative search', () => {
    const query = transactionsSearch(q('transactions'), '-$5', 'MM/dd/yyyy');
    expect(JSON.stringify(query.state.filterExpressions)).toContain(
      '"$eq":500',
    );
  });

  it.each([
    ['1', true],
    ['1.', true],
    ['$1', true],
    ['1.00', false],
    ['1.99', false],
  ])('searching %s matches whole-unit amounts: %s', (search, expected) => {
    const query = transactionsSearch(q('transactions'), search, 'MM/dd/yyyy');
    expect(
      JSON.stringify(query.state.filterExpressions).includes('$idiv'),
    ).toBe(expected);
  });
});
