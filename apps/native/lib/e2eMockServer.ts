import { setupServer } from 'msw/native';
import { handlers, onUnhandledRequest } from '@singjam/test-fixtures/msw';

// Only loaded when EXPO_PUBLIC_E2E=1 (see app/_layout.tsx): the app answers Google Places and every
// other outside service from the shared handlers, and any unmocked outside request fails.
setupServer(...handlers).listen({ onUnhandledRequest });
