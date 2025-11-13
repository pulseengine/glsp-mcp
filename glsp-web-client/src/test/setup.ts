/**
 * Vitest setup file
 * Runs before all tests to set up the testing environment
 */

import { vi } from 'vitest';

// Mock browser APIs that aren't available in jsdom

// Mock Canvas API - Create a shared mock context that persists across calls
const createMockContext = () => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  font: '10px sans-serif',
  textAlign: 'left',
  textBaseline: 'top',
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0 })),
  setTransform: vi.fn(),
  getTransform: vi.fn(() => ({
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0,
  })),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createPattern: vi.fn(() => null),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: [], width: 0, height: 0 })),
  putImageData: vi.fn(),
  clip: vi.fn(),
  isPointInPath: vi.fn(() => false),
  isPointInStroke: vi.fn(() => false),
});

HTMLCanvasElement.prototype.getContext = vi.fn((contextType) => {
  if (contextType === '2d') {
    return createMockContext() as any;
  }
  return null;
}) as any;

// Mock fetch API
global.fetch = vi.fn();

// Mock console methods to reduce test noise (optional)
global.console = {
  ...console,
  // Suppress console.log in tests unless needed
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  // Preserve error and warn for debugging
  error: console.error,
  warn: console.warn,
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
