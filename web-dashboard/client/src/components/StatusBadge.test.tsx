import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="Evaluated" />);
    expect(screen.getByText('Evaluated')).toBeDefined();
  });

  it('applies the correct CSS class for "Evaluated" status', () => {
    const { container } = render(<StatusBadge status="Evaluated" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-badge')).toBe(true);
    expect(badge.classList.contains('status-evaluated')).toBe(true);
  });

  it('applies the correct CSS class for "Applied" status', () => {
    const { container } = render(<StatusBadge status="Applied" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-applied')).toBe(true);
  });

  it('applies the correct CSS class for "Interview" status', () => {
    const { container } = render(<StatusBadge status="Interview" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-interview')).toBe(true);
  });

  it('applies the correct CSS class for "Offer" status', () => {
    const { container } = render(<StatusBadge status="Offer" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-offer')).toBe(true);
  });

  it('applies the correct CSS class for "Rejected" status', () => {
    const { container } = render(<StatusBadge status="Rejected" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-rejected')).toBe(true);
  });

  it('applies the correct CSS class for "SKIP" status', () => {
    const { container } = render(<StatusBadge status="SKIP" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-skip')).toBe(true);
  });

  it('applies the correct CSS class for "Discarded" status', () => {
    const { container } = render(<StatusBadge status="Discarded" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-discarded')).toBe(true);
  });

  it('applies the correct CSS class for "Responded" status', () => {
    const { container } = render(<StatusBadge status="Responded" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.classList.contains('status-responded')).toBe(true);
  });
});
