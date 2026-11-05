import { afterAll, afterEach } from '@jest/globals';
import { installMockServer } from '@singjam/test-fixtures/msw/node';

// Every outside service (Google Places, Expo push, …) is answered by MSW during tests, and any
// unmocked outside request fails the test instead of reaching a real service.
installMockServer({ afterEach, afterAll });
