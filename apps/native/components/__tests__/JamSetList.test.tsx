import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import JamSetList from '../JamSetList';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'native-token' } } }) } },
}));

type Route = (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined;
function mockApi(route: Route) {
  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    const r = route(url, init) ?? { status: 404, body: {} };
    return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body ?? {}) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const method = (init?: RequestInit) => init?.method ?? 'GET';
const calls = (fetchMock: jest.Mock, m: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => method(init) === m && (url as string).endsWith(path));

beforeEach(() => mockPush.mockReset());

describe('JamSetList', () => {
  it('lets someone running the jam create a set list named after the jam', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/api/jam/jam-1/set')) return { status: 200, body: { set: null } };
      if (url.endsWith('/api/sets') && method(init) === 'POST') return { status: 200, body: { id: 'set-new', short_code: 'abc' } };
    });
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage />);

    await fireEvent.press(await screen.findByText('Create set list'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/set/set-new'));
    const [, init] = calls(fetchMock, 'POST', '/api/sets')[0];
    expect(JSON.parse(init!.body as string)).toEqual({ name: 'Spring Sing — set list', jamId: 'jam-1' });
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer native-token');
  });

  it('links one of your set lists', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/api/jam/jam-1/set') && method(init) === 'GET') return { status: 200, body: { set: null } };
      if (url.endsWith('/api/sets')) return { status: 200, body: { owned: [{ id: 'set-1', name: 'Folk night', jam_id: null }], collaborating: [] } };
      if (url.endsWith('/api/jam/jam-1/set') && method(init) === 'PUT') return { status: 200, body: { ok: true } };
    });
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage />);

    await fireEvent.press(await screen.findByText('Link existing'));
    await fireEvent.press(await screen.findByText('Folk night'));

    expect(await screen.findByText('Unlink')).toBeTruthy();
    const [, init] = calls(fetchMock, 'PUT', '/api/jam/jam-1/set')[0];
    expect(JSON.parse(init!.body as string)).toEqual({ setId: 'set-1', move: false });
  });

  it('asks before taking a set list that belongs to another jam', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/api/jam/jam-1/set') && method(init) === 'GET') return { status: 200, body: { set: null } };
      if (url.endsWith('/api/sets')) return { status: 200, body: { owned: [{ id: 'set-2', name: 'Winter set', jam_id: 'jam-9', jam_name: 'Winter Sing' }], collaborating: [] } };
    });
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage />);

    await fireEvent.press(await screen.findByText('Link existing'));
    await fireEvent.press(await screen.findByText('Winter set (linked to Winter Sing)'));

    expect(alert).toHaveBeenCalledWith(
      'Winter set is already the set list for Winter Sing',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Link a copy' }), expect.objectContaining({ text: 'Move it here' })]),
    );
    expect(calls(fetchMock, 'PUT', '/api/jam/jam-1/set')).toHaveLength(0);
    alert.mockRestore();
  });

  it('unlinks the set list', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.endsWith('/api/jam/jam-1/set') && method(init) === 'GET') return { status: 200, body: { set: { id: 'set-1', name: 'Folk night' } } };
      if (url.endsWith('/api/jam/jam-1/set') && method(init) === 'DELETE') return { status: 200, body: { ok: true } };
    });
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage />);

    await fireEvent.press(await screen.findByText('Unlink'));

    expect(await screen.findByText('Create set list')).toBeTruthy();
    expect(calls(fetchMock, 'DELETE', '/api/jam/jam-1/set')).toHaveLength(1);
  });

  it("shows an attendee the linked set list without the controls", async () => {
    mockApi(() => ({ status: 200, body: { set: { id: 'set-1', name: 'Folk night' } } }));
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage={false} />);

    expect(await screen.findByText('Folk night')).toBeTruthy();
    expect(screen.queryByText('Unlink')).toBeNull();
  });

  it('shows nothing to an attendee when the jam has no set list', async () => {
    mockApi(() => ({ status: 200, body: { set: null } }));
    await render(<JamSetList jamId="jam-1" jamName="Spring Sing" canManage={false} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText('Create set list')).toBeNull();
    expect(screen.queryByText('Set list')).toBeNull();
  });
});
