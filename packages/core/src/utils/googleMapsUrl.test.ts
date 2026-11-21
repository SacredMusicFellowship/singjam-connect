import { describe, it, expect } from 'vitest';
import { googleMapsUrl } from './googleMapsUrl';

describe('googleMapsUrl', () => {
  it('builds a Maps URLs search link', () => {
    expect(googleMapsUrl('The Starry Plough Pub, Shattuck Avenue, Berkeley, CA, USA')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        'The%20Starry%20Plough%20Pub%2C%20Shattuck%20Avenue%2C%20Berkeley%2C%20CA%2C%20USA'
    );
  });

  it('encodes characters that would otherwise break the query', () => {
    const url = googleMapsUrl('5th & Main #2, San Francisco');
    expect(url).toContain('5th%20%26%20Main%20%232');
    // A raw & or # would truncate the query or start a fragment.
    expect(url!.split('query=')[1]).not.toMatch(/[&#]/);
  });

  it('returns null for a blank or missing location', () => {
    expect(googleMapsUrl(null)).toBeNull();
    expect(googleMapsUrl(undefined)).toBeNull();
    expect(googleMapsUrl('')).toBeNull();
    expect(googleMapsUrl('   ')).toBeNull();
  });

  it('refuses the TBD placeholder rather than searching for it', () => {
    expect(googleMapsUrl('TBD')).toBeNull();
    expect(googleMapsUrl('tbd')).toBeNull();
    expect(googleMapsUrl(' TBD ')).toBeNull();
  });

  it('still links a real place whose name merely contains "tbd"', () => {
    expect(googleMapsUrl('TBD Records, Oakland')).not.toBeNull();
  });
});
