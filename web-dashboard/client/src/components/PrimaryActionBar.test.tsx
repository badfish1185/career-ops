import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrimaryActionBar from './PrimaryActionBar';

describe('PrimaryActionBar', () => {
  it('renders the selected-record context and primary controls together', () => {
    render(
      <PrimaryActionBar
        ariaLabel="Selected application primary actions"
        title="Copy evaluation brief"
        description="Use tracker context to continue processing the selected application."
        meta={['Acme AI #42', 'Evaluated', 'Score 4.5/5', null, false]}
        actions={<button type="button">Copy brief</button>}
      />,
    );

    const actionBar = screen.getByLabelText('Selected application primary actions');
    expect(actionBar).toHaveAttribute('aria-live', 'polite');
    expect(within(actionBar).getByText('Copy evaluation brief')).toBeInTheDocument();
    expect(within(actionBar).getByText('Use tracker context to continue processing the selected application.')).toBeInTheDocument();
    expect(within(actionBar).getByLabelText('Selected application primary actions context')).toHaveTextContent('Acme AI #42');
    expect(within(actionBar).getByLabelText('Selected application primary actions context')).toHaveTextContent('Evaluated');
    expect(within(actionBar).getByLabelText('Selected application primary actions context')).toHaveTextContent('Score 4.5/5');
    expect(within(actionBar).getByRole('button', { name: /Copy brief/i })).toBeInTheDocument();
  });
});
