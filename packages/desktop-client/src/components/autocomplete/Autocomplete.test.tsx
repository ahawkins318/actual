import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestProviders } from '#mocks';

import { Autocomplete } from './Autocomplete';

const suggestions = [
  { id: 'apple', name: 'Apple' },
  { id: 'banana', name: 'Banana' },
];

function renderAutocomplete(value: string, onUpdate: () => void) {
  return (
    <TestProviders>
      <Autocomplete
        strict
        focused
        clearOnBlur={false}
        suggestions={suggestions}
        value={value}
        onUpdate={onUpdate}
        onSelect={vi.fn()}
      />
    </TestProviders>
  );
}

describe('Autocomplete', () => {
  it('reverts to the last committed value on Escape', async () => {
    const onUpdate = vi.fn();
    const { rerender } = render(renderAutocomplete('apple', onUpdate));

    // A table cell commits a selection while its editor stays open, so the
    // field's value changes without remounting the autocomplete.
    rerender(renderAutocomplete('banana', onUpdate));
    await userEvent.type(screen.getByRole('textbox'), '{Escape}');

    expect(onUpdate).toHaveBeenLastCalledWith('banana', 'banana');
  });
});
