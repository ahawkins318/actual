import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { TestProviders } from '#mocks';

import { ConfirmPayeesMergeModal } from './ConfirmPayeesMergeModal';

vi.mock('#hooks/usePayees', () => ({
  usePayees: () => ({
    data: [
      { id: 'a', name: 'Trader Joes' },
      { id: 'b', name: "Trader Joe's" },
      { id: 'c', name: 'TJs' },
    ],
  }),
}));

function renderModal(overrides = {}) {
  const onConfirm = vi.fn();
  render(
    <TestProviders>
      <ConfirmPayeesMergeModal
        payeeIds={['b']}
        targetPayeeId="a"
        onConfirm={onConfirm}
        {...overrides}
      />
    </TestProviders>,
  );
  return { onConfirm };
}

const cycle = () =>
  fireEvent.click(screen.getByLabelText('Choose a different payee to keep'));

describe('ConfirmPayeesMergeModal', () => {
  it('confirms with the originally-requested target by default', () => {
    const { onConfirm } = renderModal();

    fireEvent.click(screen.getByText('Merge'));

    expect(onConfirm).toHaveBeenCalledWith('a');
  });

  it('confirms with the other payee once the arrow is clicked', () => {
    const { onConfirm } = renderModal();

    cycle();
    fireEvent.click(screen.getByText('Merge'));

    expect(onConfirm).toHaveBeenCalledWith('b');
  });

  it('cycles back to the original target after visiting every payee', () => {
    const { onConfirm } = renderModal();

    cycle(); // a -> b
    cycle(); // b -> a
    fireEvent.click(screen.getByText('Merge'));

    expect(onConfirm).toHaveBeenCalledWith('a');
  });

  it('cycles through more than two payees in order', () => {
    const { onConfirm } = renderModal({ payeeIds: ['b', 'c'] });

    cycle(); // a -> b
    cycle(); // b -> c
    fireEvent.click(screen.getByText('Merge'));

    expect(onConfirm).toHaveBeenCalledWith('c');
  });

  it('renders every other payee as pending deletion', () => {
    renderModal({ payeeIds: ['b', 'c'] });

    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
    expect(screen.getByText('TJs')).toBeInTheDocument();
  });
});
