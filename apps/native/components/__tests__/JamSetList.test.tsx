import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import JamSetList from '../JamSetList';

const push = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

const setApi = jest.fn();
jest.mock('@/lib/setApi', () => ({ setApi: (...args: unknown[]) => setApi(...args) }));

type Reply = { ok?: boolean; json?: unknown };
function replies(routes: Record<string, Reply>) {
  setApi.mockImplementation((path: string, method: string) => {
    const r = routes[`${method} ${path}`] ?? { ok: false, json: null };
    return Promise.resolve({ ok: r.ok ?? true, status: r.ok === false ? 500 : 200, json: r.json ?? null });
  });
}
const calls = (method: string, path: string) => setApi.mock.calls.filter(([p, m]) => p === path && m === method);

beforeEach(() => {
  setApi.mockReset();
  push.mockReset();
});

describe('JamSetList', () => {
  it('lets a host create a set list named after the jam', async () => {
    replies({
      'GET /api/jam/jam-1/set': { json: { set: null } },
      'POST /api/sets': { json: { id: 'set-new', short_code: 'abc123' } },
    });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage />);

    await fireEvent.press(await screen.findByText('Create set list'));

    await waitFor(() => expect(push).toHaveBeenCalledWith({ pathname: '/set/[id]', params: { id: 'set-new' } }));
    expect(calls('POST', '/api/sets')[0][2]).toEqual({ name: 'Porch Harmonies — set list', jamId: 'jam-1' });
  });

  it('shows the linked set to someone who cannot manage it, without Unlink', async () => {
    replies({ 'GET /api/jam/jam-1/set': { json: { set: { id: 'set-1', name: 'Porch Harmonies set list' } } } });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage={false} />);

    expect(await screen.findByText('Porch Harmonies set list')).toBeTruthy();
    expect(screen.queryByText('Unlink')).toBeNull();
  });

  it('shows nothing to a guest when the jam has no set list', async () => {
    replies({ 'GET /api/jam/jam-1/set': { json: { set: null } } });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage={false} />);

    await waitFor(() => expect(setApi).toHaveBeenCalled());
    expect(screen.queryByText('Set list')).toBeNull();
  });

  it('unlinks, and puts the set back if the server refuses', async () => {
    replies({
      'GET /api/jam/jam-1/set': { json: { set: { id: 'set-1', name: 'Porch Harmonies set list' } } },
      'DELETE /api/jam/jam-1/set': { ok: false },
    });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage />);

    await fireEvent.press(await screen.findByText('Unlink'));

    expect(await screen.findByText("Couldn't unlink the set list. Please try again.")).toBeTruthy();
    expect(screen.getByText('Porch Harmonies set list')).toBeTruthy();
  });

  it('links an existing set the host owns', async () => {
    replies({
      'GET /api/jam/jam-1/set': { json: { set: null } },
      'GET /api/sets': { json: { owned: [{ id: 'set-2', name: 'Songs to practice', jam_id: null }], collaborating: [] } },
      'PUT /api/jam/jam-1/set': { json: { ok: true } },
    });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage />);

    await fireEvent.press(await screen.findByText('Link existing'));
    await fireEvent.press(await screen.findByText('Songs to practice'));

    expect(await screen.findByText('Unlink')).toBeTruthy();
    expect(calls('PUT', '/api/jam/jam-1/set')[0][2]).toEqual({ setId: 'set-2', move: false });
  });

  it('asks before taking a set off another jam, and links a copy when chosen', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    replies({
      'GET /api/jam/jam-1/set': { json: { set: null } },
      'GET /api/sets': { json: { owned: [{ id: 'set-3', name: 'Hymns', jam_id: 'jam-2', jam_name: 'Sunday Sing' }], collaborating: [] } },
      'POST /api/sets/set-3/copy': { json: { id: 'set-4', short_code: 'cpy' } },
      'PUT /api/jam/jam-1/set': { json: { ok: true } },
    });
    await render(<JamSetList jamId="jam-1" jamName="Porch Harmonies" canManage />);

    await fireEvent.press(await screen.findByText('Link existing'));
    await fireEvent.press(await screen.findByText('Hymns (linked to Sunday Sing)'));

    expect(calls('PUT', '/api/jam/jam-1/set')).toHaveLength(0);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Link a copy', 'Move it here', 'Back']);
    buttons[0].onPress!();

    expect(await screen.findByText('Copy of Hymns')).toBeTruthy();
    expect(calls('PUT', '/api/jam/jam-1/set')[0][2]).toEqual({ setId: 'set-4', move: false });
    alert.mockRestore();
  });
});
