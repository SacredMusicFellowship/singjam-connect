import { fireEvent, render, screen } from '@testing-library/react-native';
import SetSongRow, { type SetSong } from '../SetSongRow';
import { showOptionsSheet } from '@/lib/actionSheet';

jest.mock('@/components/BrandHeader', () => ({ WIDE_BREAKPOINT: 768 }));
jest.mock('@/lib/actionSheet', () => ({ showOptionsSheet: jest.fn(), anchorFrom: () => undefined }));
const sheet = showOptionsSheet as jest.Mock;

const song: SetSong = {
  id: 'row-1',
  song_id: 'song-1',
  position: 1,
  key_note: null,
  notes: null,
  played: false,
  leader_user_ids: [],
  songs: { title: 'Wade in the Water', display_artist: 'Traditional', byline: 'Traditional', chord_chart_url: null },
};

async function renderRow(props: { myUserId: string | null; myConfidence: string | null | undefined }) {
  const onSetMyConfidence = jest.fn();
  await render(
    <SetSongRow
      song={song}
      canManage={false}
      canRemove={false}
      displayPosition={1}
      participants={[]}
      participantKnowledge={new Map()}
      participantKeys={new Map()}
      hasEligible={false}
      isPublicViewer
      onSetMyConfidence={onSetMyConfidence}
      onRemove={jest.fn()}
      onKeyChange={jest.fn()}
      onNotesChange={jest.fn()}
      onLeaderToggle={jest.fn()}
      onTogglePlayed={jest.fn()}
      {...props}
    />
  );
  return onSetMyConfidence;
}

function choose(label: string) {
  const { options } = sheet.mock.calls.at(-1)[0] as { options: { label: string; onPress: () => void }[] };
  options.find((o) => o.label === label)!.onPress();
}

beforeEach(() => sheet.mockClear());

describe('SetSongRow repertoire buttons', () => {
  it('adds a song you want to learn in one tap', async () => {
    const onSet = await renderRow({ myUserId: 'me', myConfidence: null });
    await fireEvent.press(screen.getByText('Want to learn it'));
    expect(onSet).toHaveBeenCalledWith('learn');
  });

  it('asks lead or support for a song you know', async () => {
    const onSet = await renderRow({ myUserId: 'me', myConfidence: null });
    await fireEvent.press(screen.getByText('I know this song!'));
    const { options } = sheet.mock.calls[0][0];
    expect(options.map((o: { label: string }) => o.label)).toEqual(['Lead', 'Support']);
    choose('Support');
    expect(onSet).toHaveBeenCalledWith('support');
  });

  it('sends a signed-out viewer to sign in without asking their part', async () => {
    const onSet = await renderRow({ myUserId: null, myConfidence: null });
    await fireEvent.press(screen.getByText('I know this song!'));
    expect(sheet).not.toHaveBeenCalled();
    expect(onSet).toHaveBeenCalledTimes(1);
  });

  it('shows your role instead of the buttons for a song you are learning, and moves you up from it', async () => {
    const onSet = await renderRow({ myUserId: 'me', myConfidence: 'learn' });
    expect(screen.queryByText('I know this song!')).toBeNull();
    expect(screen.queryByText('Want to learn it')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Role'));
    expect(screen.getByText('Learn')).toBeTruthy();
    choose('Lead');
    expect(onSet).toHaveBeenCalledWith('lead');
  });

  it("offers nothing until your songs have loaded, so a song you know doesn't flash the buttons", async () => {
    await renderRow({ myUserId: 'me', myConfidence: undefined });
    expect(screen.queryByText('I know this song!')).toBeNull();
    expect(screen.queryByLabelText('Role')).toBeNull();
  });
});
