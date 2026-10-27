import { describe, it, expect } from 'vitest';
import { dropUsCountry, dropVenueRepeatedInTitle } from './formatVenueAddress';

describe('dropVenueRepeatedInTitle', () => {
  it('drops a venue name the title already gives', () => {
    expect(
      dropVenueRepeatedInTitle(
        'The Starry Plough Pub, 3101 Shattuck Ave, Berkeley, CA 94705, USA',
        'SingJam at the Starry Plough'
      )
    ).toBe('3101 Shattuck Ave, Berkeley, CA 94705, USA');
  });

  it('keeps a venue name the title does not mention', () => {
    const address = 'Cedar Rose Park, 1300 Rose St, Berkeley, CA, USA';
    expect(dropVenueRepeatedInTitle(address, 'Sunday folk jam')).toBe(address);
  });

  it('keeps the venue when only some of its words are in the title', () => {
    const address = 'Freight & Salvage, 2020 Addison St, Berkeley, CA, USA';
    expect(dropVenueRepeatedInTitle(address, 'Salvage the night')).toBe(address);
  });

  it('never drops a street line', () => {
    const address = '2727 California St, Berkeley, CA, USA';
    expect(dropVenueRepeatedInTitle(address, 'SingJam at 2727 California')).toBe(address);
  });

  it('leaves a single-part address alone', () => {
    expect(dropVenueRepeatedInTitle('Starry Plough', 'SingJam at the Starry Plough')).toBe('Starry Plough');
  });

  it('leaves the address alone when there is no title', () => {
    const address = 'The Starry Plough Pub, Shattuck Avenue, Berkeley, CA, USA';
    expect(dropVenueRepeatedInTitle(address, null)).toBe(address);
  });
});

describe('dropUsCountry', () => {
  it('drops a trailing USA', () => {
    expect(dropUsCountry('3101 Shattuck Ave, Berkeley, CA 94705, USA')).toBe('3101 Shattuck Ave, Berkeley, CA 94705');
  });

  it('drops a trailing United States', () => {
    expect(dropUsCountry('Berkeley, CA, United States')).toBe('Berkeley, CA');
  });

  it('keeps other countries', () => {
    expect(dropUsCountry('10 Downing St, London, UK')).toBe('10 Downing St, London, UK');
  });

  it('only touches the last part', () => {
    expect(dropUsCountry('USA Hall, Berkeley, CA')).toBe('USA Hall, Berkeley, CA');
  });
});
