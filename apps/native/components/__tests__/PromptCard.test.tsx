import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PromptCard from '../PromptCard';

describe('PromptCard', () => {
  it('shows the title and body', async () => {
    await render(<PromptCard variant="guest" title="Track the songs you know" body="Sign in to build your repertoire." />);

    expect(screen.getByText('Track the songs you know')).toBeTruthy();
    expect(screen.getByText('Sign in to build your repertoire.')).toBeTruthy();
  });

  it('calls onAction when the action is pressed', async () => {
    const onAction = jest.fn();
    await render(<PromptCard variant="nudge" title="Your repertoire is empty" body="Browse songs to add some." actionLabel="Browse songs →" onAction={onAction} />);

    await fireEvent.press(screen.getByText('Browse songs →'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('hides the action when there is no handler for it', async () => {
    await render(<PromptCard variant="guest" title="This set is private" body="Only collaborators can see it." actionLabel="Sign in →" />);

    expect(screen.queryByText('Sign in →')).toBeNull();
  });
});
