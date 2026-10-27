import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ungroupSearchResults,
  useTransactionsSearch,
} from './useTransactionsSearch';

function searchedQuery(query: Query) {
  let result: Query | undefined;
  const { result: hook } = renderHook(() =>
    useTransactionsSearch({
      updateQuery: updateFn => {
        result = updateFn(query);
      },
      resetQuery: vi.fn(),
      dateFormat: 'MM/dd/yyyy',
    }),
  );
  act(() => {
    hook.current.search('Grocer');
    vi.runAllTimers();
  });
  return result;
}

describe('useTransactionsSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches split lines grouped so their parent is returned', () => {
    const query = q('transactions').options({ splits: 'all' });
    expect(searchedQuery(query)?.state.tableOptions.splits).toBe('grouped');
  });

  it('leaves other splits options alone', () => {
    const query = q('transactions').options({ splits: 'inline' });
    expect(searchedQuery(query)?.state.tableOptions.splits).toBe('inline');
  });
});

describe('ungroupSearchResults', () => {
  it('lists a split parent followed by only its matching lines', () => {
    const transactions = [
      {
        id: 'split',
        is_parent: true,
        _unmatched: true,
        subtransactions: [
          { id: 'line-a', is_child: true, parent_id: 'split' },
          {
            id: 'line-b',
            is_child: true,
            parent_id: 'split',
            _unmatched: true,
          },
        ],
      },
      { id: 'plain' },
    ] as TransactionEntity[];

    expect(ungroupSearchResults(transactions).map(t => t.id)).toEqual([
      'split',
      'line-a',
      'plain',
    ]);
  });
});
