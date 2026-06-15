import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DispositionDock from './DispositionDock';

describe('DispositionDock', () => {
  it('renders compact disposition controls and marks the current status', () => {
    const onDispatch = vi.fn();
    render(
      <DispositionDock
        currentStatusKey="skip"
        saveMessage="Disposition saved to tracker"
        onDispatch={onDispatch}
      />,
    );

    const dock = screen.getByLabelText('Fast disposition controls');
    expect(within(dock).getByText('Disposition dock')).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: /Skip/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dock).getByText('Current')).toBeInTheDocument();
    expect(within(dock).getByRole('status')).toHaveTextContent('Disposition saved to tracker');

    fireEvent.click(within(dock).getByRole('button', { name: /Applied/i }));
    expect(onDispatch).toHaveBeenCalledWith('applied');
  });

  it('exposes the full writeback path when notes review is available', () => {
    const onOpenWriteback = vi.fn();
    render(
      <DispositionDock
        currentStatusKey="evaluated"
        onDispatch={vi.fn()}
        onOpenWriteback={onOpenWriteback}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Review notes/i }));
    expect(onOpenWriteback).toHaveBeenCalledTimes(1);
  });
});
