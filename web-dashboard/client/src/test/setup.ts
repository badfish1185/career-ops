import '@testing-library/jest-dom';

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => {},
});

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: () => {},
});
