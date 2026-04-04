import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

class MockIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});
