import { useEffect, useMemo, useRef, useState } from 'react';

import type { Query } from '@actual-app/core/shared/query';
import { ungroupTransactions } from '@actual-app/core/shared/transactions';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { debounce } from 'es-toolkit/compat';

import * as queries from '#queries';

type UseTransactionsSearchProps = {
  updateQuery: (updateFn: (searchQuery: Query) => Query) => void;
  resetQuery: () => void;
  dateFormat: string;
  delayMs?: number;
};
type UseTransactionsSearchResult = {
  isSearching: boolean;
  search: (searchText: string) => void;
};

export function useTransactionsSearch({
  updateQuery,
  resetQuery,
  dateFormat,
  delayMs = 150,
}: UseTransactionsSearchProps): UseTransactionsSearchResult {
  const [isSearching, setIsSearching] = useState(false);

  const updateQueryRef = useRef(updateQuery);
  updateQueryRef.current = updateQuery;

  const resetQueryRef = useRef(resetQuery);
  resetQueryRef.current = resetQuery;

  const updateSearchQuery = useMemo(
    () =>
      debounce((searchText: string) => {
        if (searchText === '') {
          resetQueryRef.current?.();
          setIsSearching(false);
        } else if (searchText) {
          resetQueryRef.current?.();
          updateQueryRef.current(previousQuery =>
            groupSplitSearch(
              queries.transactionsSearch(previousQuery, searchText, dateFormat),
            ),
          );
          setIsSearching(true);
        }
      }, delayMs),
    [dateFormat, delayMs, resetQueryRef, updateQueryRef],
  );

  useEffect(() => {
    return () => updateSearchQuery.cancel();
  }, [updateSearchQuery]);

  return {
    isSearching,
    search: updateSearchQuery,
  };
}

// A split parent has no payee of its own, so an 'all' search for a payee finds
// a split's lines but not the split. A grouped search also returns the parent
// of any matching line; ungroupSearchResults flattens that back into rows.
function groupSplitSearch(query: Query) {
  const { tableOptions } = query.state;
  return tableOptions.splits === 'all'
    ? query.options({ ...tableOptions, splits: 'grouped' })
    : query;
}

// Flattens grouped search results into each split's parent followed by its
// matching lines.
export function ungroupSearchResults(
  transactions: readonly TransactionEntity[],
) {
  return ungroupTransactions([...transactions]).filter(
    t => !(t.is_child && t._unmatched),
  );
}
