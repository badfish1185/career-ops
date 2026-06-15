import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MetricCard from './MetricCard';
import { Activity } from 'lucide-react';

describe('MetricCard', () => {
  it('renders label and value correctly', () => {
    render(<MetricCard label="Total Applications" value={120} />);

    expect(screen.getByText('Total Applications')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders with an optional icon', () => {
    const { container } = render(
      <MetricCard
        label="Success Rate"
        value="15%"
        icon={<Activity data-testid="test-icon" />}
      />
    );

    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies the correct CSS classes', () => {
    const { container } = render(<MetricCard label="Score" value="4.5" />);

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('metric-card');
    expect(screen.getByText('Score')).toHaveClass('metric-label');
    expect(screen.getByText('4.5')).toHaveClass('metric-value');
  });
});
