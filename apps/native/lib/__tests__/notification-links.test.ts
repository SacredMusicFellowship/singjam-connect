import { hrefForNotificationLink } from '../notification-links';

describe('hrefForNotificationLink', () => {
  it('opens a song notification on the song screen', () => {
    const id = '3f2b8c1e-0d4a-4b7e-9a51-2c6d8e9f1a23';
    expect(hrefForNotificationLink(`/songs/${id}`)).toEqual({ pathname: '/song/[id]', params: { id } });
  });

  it('ignores song links by slug, which the song screen cannot load', () => {
    expect(hrefForNotificationLink('/songs/jolene')).toBeNull();
  });

  it('still maps jams and sets', () => {
    expect(hrefForNotificationLink('/jam/abc')).toEqual({ pathname: '/jam/[id]', params: { id: 'abc' } });
    expect(hrefForNotificationLink('/set/xyz')).toEqual({ pathname: '/set/[id]', params: { id: 'xyz' } });
  });
});
