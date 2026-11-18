import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SubmitMissingSong from '../SubmitMissingSong';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) } },
}));
jest.mock('@/components/YouTubePlayer', () => () => null);

type Reply = { status: number; body: unknown };
function mockFetch(lookup: Reply, submit?: Reply) {
  const fetchMock = jest.fn((url: string) => {
    const r = url.includes('/api/songs/lookup') ? lookup : submit!;
    return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const match = { title: 'Proud Mary', artist: 'Creedence Clearwater Revival', spotify_url: 'https://open.spotify.com/track/abc', release_year: 1969, youtube_id: null, youtube_official: false, existing: null };

describe('SubmitMissingSong in a set', () => {
  it('confirms the match, adds it, and hands back the new song for the set', async () => {
    const fetchMock = mockFetch({ status: 200, body: match }, { status: 200, body: { id: 'new-id', slug: 'proud-mary' } });
    const onCreated = jest.fn();
    await render(<SubmitMissingSong defaultTitle="proud mary" forSet onCreated={onCreated} />);

    expect(screen.getByText("We'll look it up, add it to the library and put it in this set.")).toBeTruthy();
    await fireEvent.press(screen.getByText('Look up'));
    await fireEvent.press(await screen.findByText("Yes, that's the song — add it"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-id', 'Proud Mary'));
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ title: 'Proud Mary', confirmed: true });
  });

  it('offers a song already in the library for the set instead of adding a copy', async () => {
    const existing = { id: 'old-id', slug: 'proud-mary', title: 'Proud Mary', display_artist: 'CCR', match: 'same' };
    const fetchMock = mockFetch({ status: 200, body: { ...match, existing } });
    const onCreated = jest.fn();
    await render(<SubmitMissingSong defaultTitle="Proud Mary" forSet onCreated={onCreated} />);

    await fireEvent.press(screen.getByText('Look up'));
    await fireEvent.press(await screen.findByText('Add it to the set'));

    expect(onCreated).toHaveBeenCalledWith('old-id', 'Proud Mary');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the library's song when the server finds it was already added", async () => {
    mockFetch({ status: 200, body: match }, { status: 409, body: { error: 'This song is already in our library.', id: 'old-id' } });
    const onCreated = jest.fn();
    await render(<SubmitMissingSong defaultTitle="Proud Mary" forSet onCreated={onCreated} />);

    await fireEvent.press(screen.getByText('Look up'));
    await fireEvent.press(await screen.findByText("Yes, that's the song — add it"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('old-id', 'Proud Mary'));
  });

  it('keeps "Open it" outside a set', async () => {
    mockFetch({ status: 200, body: { ...match, existing: { id: 'old-id', slug: null, title: 'Proud Mary', display_artist: null, match: 'same' } } });
    await render(<SubmitMissingSong defaultTitle="Proud Mary" onCreated={jest.fn()} />);

    await fireEvent.press(screen.getByText('Look up'));
    expect(await screen.findByText('Open it')).toBeTruthy();
  });
});
