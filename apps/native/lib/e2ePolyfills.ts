// MSW sets up its WebSocket and SSE support with these browser APIs as it loads, and
// React Native doesn't have them. Minimal stand-ins, only ever loaded under EXPO_PUBLIC_E2E=1; the
// app makes no WebSocket or SSE calls through MSW.
const g = globalThis as Record<string, unknown>;

if (typeof g.Event === 'undefined') {
  g.Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

const BaseEvent = g.Event as new (type: string, init?: object) => object;

if (typeof g.MessageEvent === 'undefined') {
  g.MessageEvent = class MessageEvent extends BaseEvent {
    data: unknown;
    origin: string;
    constructor(type: string, init: { data?: unknown; origin?: string } = {}) {
      super(type, init);
      this.data = init.data;
      this.origin = init.origin ?? '';
    }
  };
}

if (typeof g.CloseEvent === 'undefined') {
  g.CloseEvent = class CloseEvent extends BaseEvent {
    code: number;
    reason: string;
    wasClean: boolean;
    constructor(type: string, init: { code?: number; reason?: string; wasClean?: boolean } = {}) {
      super(type, init);
      this.code = init.code ?? 0;
      this.reason = init.reason ?? '';
      this.wasClean = init.wasClean ?? false;
    }
  };
}

if (typeof g.EventTarget === 'undefined') {
  g.EventTarget = class EventTarget {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  };
}

if (typeof g.BroadcastChannel === 'undefined') {
  g.BroadcastChannel = class BroadcastChannel {
    name: string;
    onmessage: unknown = null;
    constructor(name: string) {
      this.name = name;
    }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
