import { fireEvent, render, screen } from '@testing-library/react-native';
import PromptCard from '../PromptCard';

describe('PromptCard', () => {
  it('shows the title and body', () => {
    render(<PromptCard variant="guest" title="Track the songs you know" body="Sign in to build your repertoire." />);

    expect(screen.getByText('Track the songs you know')).toBeTruthy();
    expect(screen.getByText('Sign in to build your repertoire.')).toBeTruthy();
  });

  it('calls onAction when the action is pressed', () => {
    const onAction = jest.fn();
    render(<PromptCard variant="nudge" title="Your repertoire is empty" body="Browse songs to add some." actionLabel="Browse songs →" onAction={onAction} />);

    fireEvent.press(screen.getByText('Browse songs →'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('hides the action when there is no handler for it', () => {
    render(<PromptCard variant="guest" title="This set is private" body="Only collaborators can see it." actionLabel="Sign in →" />);

    expect(screen.queryByText('Sign in →')).toBeNull();
  });
});
