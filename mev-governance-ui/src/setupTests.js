// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// IndexedDB for the tests of the local source library; structuredClone is missing in this jsdom.
import 'fake-indexeddb/auto';
if (typeof globalThis.structuredClone === 'undefined') globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));
