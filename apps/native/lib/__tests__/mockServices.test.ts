import { describe, expect, it } from '@jest/globals';
import { mockCalls } from '@singjam/test-fixtures/msw/node';

// Native screens call Google Places directly (the address pickers) and the web API for push; in
// Jest, MSW answers them and blocks anything unmocked.
describe('outside services in native tests', () => {
  it('answers Google Places autocomplete with the fixtures venues', async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': 'test' },
      body: JSON.stringify({ input: 'lantern' }),
    });
    const json = await res.json();

    expect(json.suggestions[0].placePrediction.structuredFormat.mainText.text).toBe('The Lantern Room');
    expect(mockCalls('google-places')).toHaveLength(1);
  });

  it('blocks an outside request that has no handler', async () => {
    const res = await fetch('https://api.example.org/anything');

    expect(res.status).toBe(500);
  });
});
