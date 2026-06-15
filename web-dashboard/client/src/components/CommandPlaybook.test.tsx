import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandPlaybook, { type CommandAction } from './CommandPlaybook';

const actions: CommandAction[] = [
  {
    id: 'apply',
    label: 'Build application package',
    command: '/career-ops apply',
    helper: 'Prepare the application package for review.',
    tone: 'strong',
    brief: 'Primary apply brief',
    suggestedStatus: 'Applied',
  },
  {
    id: 'research',
    label: 'Research company context',
    command: '/career-ops deep',
    helper: 'Collect company-specific evidence and risks.',
    tone: 'neutral',
    brief: 'Secondary research brief',
  },
  {
    id: 'followup',
    label: 'Draft follow-up',
    command: '/career-ops followup',
    helper: 'Write a concise follow-up for review.',
    tone: 'risk',
    brief: 'Follow-up brief',
    suggestedStatus: 'Responded',
  },
];

describe('CommandPlaybook', () => {
  it('selects secondary actions before copying so the preview and command state stay coherent', () => {
    const onCopy = vi.fn();

    render(
      <CommandPlaybook
        title="Recommended command"
        actions={actions}
        copiedActionId=""
        copyFailedActionId=""
        onCopy={onCopy}
        secondaryLabel="Other playbook actions"
      />
    );

    expect(screen.getByLabelText('Selected command action')).toHaveTextContent('/career-ops apply');
    expect(screen.getByText('Primary apply brief')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow contract')).toHaveTextContent('Application package and reviewed answers');

    fireEvent.click(screen.getByRole('button', { name: /Research company context/i }));

    expect(screen.getByLabelText('Selected command action')).toHaveTextContent('/career-ops deep');
    expect(screen.getByText('Secondary research brief')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow contract')).toHaveTextContent('Dossier, risks, interview angles');
    expect(screen.getByLabelText('Workflow contract')).toHaveTextContent('Research only');

    fireEvent.click(screen.getByRole('button', { name: /Copy command brief/i }));
    expect(onCopy).toHaveBeenCalledWith(actions[1]);
  });

  it('stages the selected action when that action has a suggested status', () => {
    const onStageStatus = vi.fn();

    render(
      <CommandPlaybook
        title="Recommended command"
        actions={actions}
        copiedActionId=""
        copyFailedActionId=""
        onCopy={vi.fn()}
        onStageStatus={onStageStatus}
        secondaryLabel="Other playbook actions"
      />
    );

    const selectedState = screen.getByLabelText('Selected command action');
    expect(selectedState).toHaveTextContent('/career-ops apply');
    fireEvent.click(screen.getByRole('button', { name: /Stage Applied/i }));
    expect(onStageStatus).toHaveBeenCalledWith(actions[0]);

    fireEvent.click(screen.getByRole('button', { name: /Draft follow-up/i }));
    expect(selectedState).toHaveTextContent('/career-ops followup');
    const primaryActions = screen.getByRole('button', { name: /Stage Responded/i }).closest('.command-playbook__primary-actions');
    expect(primaryActions).not.toBeNull();
    fireEvent.click(within(primaryActions as HTMLElement).getByRole('button', { name: /Stage Responded/i }));
    expect(onStageStatus).toHaveBeenCalledWith(actions[2]);
  });
});
