import { describe, it, expect, vi } from 'vitest';
import { resolvePlaceAddress } from './resolvePlaceAddress';

const respond = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;

const base = {
  placeId: 'abc',
  mainText: 'The Starry Plough Pub',
  fallback: 'The Starry Plough Pub, Shattuck Avenue, Berkeley, CA, USA',
  apiKey: 'key',
};

describe('resolvePlaceAddress', () => {
  it('puts the venue name in front of the full street address', async () => {
    const fetchImpl = respond({ formattedAddress: '3101 Shattuck Ave, Berkeley, CA 94705, USA' });
    expect(await resolvePlaceAddress({ ...base, fetchImpl })).toBe(
      'The Starry Plough Pub, 3101 Shattuck Ave, Berkeley, CA 94705, USA'
    );
  });

  it('uses the formatted address alone when it already starts with the picked text', async () => {
    const fetchImpl = respond({ formattedAddress: '2727 California St, Berkeley, CA 94703, USA' });
    expect(await resolvePlaceAddress({ ...base, mainText: '2727 California St', fetchImpl })).toBe(
      '2727 California St, Berkeley, CA 94703, USA'
    );
  });

  it('drops a leading Plus Code', async () => {
    const fetchImpl = respond({ formattedAddress: 'VPG6+FR4, 1300 Rose St, Berkeley, CA 94702, USA' });
    expect(await resolvePlaceAddress({ ...base, mainText: 'Cedar Rose Park', fetchImpl })).toBe(
      'Cedar Rose Park, 1300 Rose St, Berkeley, CA 94702, USA'
    );
  });

  it('asks only for the formatted address', async () => {
    const fetchImpl = respond({ formattedAddress: 'x' });
    await resolvePlaceAddress({ ...base, fetchImpl });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places/abc');
    expect(init.headers['X-Goog-FieldMask']).toBe('formattedAddress');
  });

  it('falls back when the request fails', async () => {
    expect(await resolvePlaceAddress({ ...base, fetchImpl: respond({}, false) })).toBe(base.fallback);
  });

  it('falls back when there is no formatted address', async () => {
    expect(await resolvePlaceAddress({ ...base, fetchImpl: respond({}) })).toBe(base.fallback);
  });

  it('falls back when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await resolvePlaceAddress({ ...base, fetchImpl })).toBe(base.fallback);
  });
});
