# Frontend Testing Guide

This document describes the testing framework and practices for the GLSP Web Client.

## Testing Framework

We use [Vitest](https://vitest.dev/) for frontend testing because:
- ✅ **Native Vite integration** - Same config, same transforms
- ✅ **Fast** - Powered by Vite's transformation pipeline
- ✅ **Jest-compatible API** - Easy migration path
- ✅ **ESM first** - Modern JavaScript support
- ✅ **TypeScript support** - Out of the box
- ✅ **Coverage** - Built-in via v8

## Quick Start

### Install Dependencies

```bash
cd glsp-web-client
npm install
```

### Run Tests

```bash
# Run all tests in watch mode
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui

# Watch specific file
npm test -- StatusManager.test.ts
```

## Test Structure

```
glsp-web-client/
├── src/
│   ├── services/
│   │   ├── McpService.ts
│   │   ├── McpService.test.ts          ✅ Tests
│   │   ├── DiagramService.ts
│   │   ├── DiagramService.test.ts      ✅ Tests
│   │   └── ...
│   ├── mcp/
│   │   ├── client.ts
│   │   └── client.test.ts              ✅ Tests
│   ├── renderer/
│   │   ├── canvas-renderer.ts
│   │   └── canvas-renderer.test.ts     ✅ Tests
│   └── test/
│       ├── setup.ts                    ✅ Test setup
│       └── mockData.ts                 ✅ Mock data
├── vitest.config.ts                    ✅ Vitest config
└── package.json
```

## Writing Tests

### Basic Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyService } from './MyService';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  it('should create instance', () => {
    expect(service).toBeDefined();
  });

  it('should perform operation', async () => {
    const result = await service.doSomething();
    expect(result).toBe('expected');
  });
});
```

### Testing Async Code

```typescript
it('should handle async operations', async () => {
  const result = await service.asyncMethod();
  expect(result).toBeDefined();
});

it('should handle promises', () => {
  return service.promiseMethod().then(result => {
    expect(result).toBe('value');
  });
});

it('should handle errors', async () => {
  await expect(service.failingMethod()).rejects.toThrow('Error message');
});
```

### Mocking

#### Mock Functions

```typescript
import { vi } from 'vitest';

it('should call callback', () => {
  const callback = vi.fn();
  service.doSomethingWithCallback(callback);

  expect(callback).toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith('argument');
});
```

#### Mock Fetch

```typescript
import { createMockFetch } from '../test/mockData';

it('should fetch data', async () => {
  const mockData = { result: 'success' };
  global.fetch = createMockFetch(mockData);

  const result = await service.fetchData();
  expect(result).toEqual(mockData);
});
```

#### Mock Canvas

```typescript
import { mockCanvas } from '../test/mockData';

it('should render to canvas', () => {
  const canvas = mockCanvas();
  const renderer = new CanvasRenderer(canvas);

  renderer.render();

  const ctx = canvas.getContext('2d');
  expect(ctx?.fillRect).toHaveBeenCalled();
});
```

### Using Mock Data

```typescript
import { mockDiagram, mockMcpToolResponse } from '../test/mockData';

it('should process diagram', () => {
  const result = service.processDiagram(mockDiagram);
  expect(result).toBeDefined();
});
```

## Test Organization

### File Naming

- Test files: `*.test.ts` or `*.spec.ts`
- Place test files next to the code they test
- Example: `McpService.ts` → `McpService.test.ts`

### Test Suites

```typescript
describe('ComponentName', () => {
  describe('feature group 1', () => {
    it('should do something', () => {});
    it('should do something else', () => {});
  });

  describe('feature group 2', () => {
    it('should handle errors', () => {});
  });
});
```

### Test Coverage

Our coverage thresholds:
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

Check coverage:
```bash
npm run test:coverage
```

View HTML report:
```bash
open coverage/index.html
```

## Testing Best Practices

### ✅ Do's

1. **Write descriptive test names**
   ```typescript
   // Good
   it('should create diagram when valid parameters provided', () => {});

   // Bad
   it('works', () => {});
   ```

2. **Test behavior, not implementation**
   ```typescript
   // Good - tests outcome
   it('should return sorted items', () => {
     expect(service.getItems()).toEqual(['a', 'b', 'c']);
   });

   // Bad - tests implementation
   it('should call sort method', () => {
     expect(service.sort).toHaveBeenCalled();
   });
   ```

3. **Use beforeEach for setup**
   ```typescript
   beforeEach(() => {
     service = new MyService();
     // Common setup
   });
   ```

4. **Test edge cases**
   ```typescript
   it('should handle empty input', () => {});
   it('should handle null values', () => {});
   it('should handle very large input', () => {});
   ```

5. **Mock external dependencies**
   ```typescript
   // Mock HTTP calls
   global.fetch = vi.fn();

   // Mock other services
   const mockService = {
     method: vi.fn().mockResolvedValue('result'),
   };
   ```

### ❌ Don'ts

1. **Don't test framework code**
   ```typescript
   // Bad - testing TypeScript/JavaScript
   it('should have a name property', () => {
     expect(service.name).toBeDefined();
   });
   ```

2. **Don't write brittle tests**
   ```typescript
   // Bad - breaks when implementation changes
   expect(service.internalCounter).toBe(5);

   // Good - tests public API
   expect(service.getCount()).toBe(5);
   ```

3. **Don't make tests dependent on each other**
   ```typescript
   // Bad - tests depend on order
   it('test 1', () => { globalState = 'value'; });
   it('test 2', () => { expect(globalState).toBe('value'); });

   // Good - each test is independent
   beforeEach(() => { globalState = 'value'; });
   ```

## Testing Different Layers

### Service Layer Tests

Test business logic and state management:

```typescript
describe('DiagramService', () => {
  it('should create new diagram', () => {});
  it('should add node to diagram', () => {});
  it('should validate diagram structure', () => {});
});
```

### MCP Client Tests

Test protocol communication:

```typescript
describe('McpClient', () => {
  it('should send JSON-RPC requests', () => {});
  it('should handle responses', () => {});
  it('should manage session', () => {});
});
```

### Renderer Tests

Test rendering logic:

```typescript
describe('CanvasRenderer', () => {
  it('should render nodes', () => {});
  it('should handle zoom/pan', () => {});
  it('should detect hits', () => {});
});
```

### UI Component Tests

Test user interactions:

```typescript
describe('SidebarComponent', () => {
  it('should toggle on click', () => {});
  it('should update when data changes', () => {});
  it('should emit events', () => {});
});
```

## Debugging Tests

### Run Single Test

```bash
npm test -- --run StatusManager.test.ts
```

### Run with Verbose Output

```bash
npm test -- --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal"
}
```

### View Test UI

```bash
npm run test:ui
```

Then open: http://localhost:51204/__vitest__/

## Continuous Integration

### GitHub Actions Example

```yaml
name: Frontend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:run
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Common Issues

### Issue: "Cannot find module"

**Solution**: Check import paths and tsconfig.json settings

```typescript
// Use relative imports
import { Service } from './Service';
// or configured aliases
import { Service } from '@/services/Service';
```

### Issue: "Canvas not supported"

**Solution**: Already configured in `src/test/setup.ts`

The setup file mocks canvas API automatically.

### Issue: "Fetch is not defined"

**Solution**: Use mock fetch from `mockData.ts`

```typescript
import { createMockFetch } from '../test/mockData';
global.fetch = createMockFetch({ result: 'data' });
```

### Issue: Tests timeout

**Solution**: Increase timeout or fix async code

```typescript
it('slow test', async () => {
  // Test code
}, 20000); // 20 second timeout
```

## Coverage Reports

### Generate Coverage

```bash
npm run test:coverage
```

### View Coverage

```bash
# HTML report
open coverage/index.html

# Terminal summary
npm run test:coverage -- --reporter=text
```

### Coverage Exclusions

These are excluded from coverage (see `vitest.config.ts`):
- `node_modules/`
- `src/test/`
- `**/*.d.ts`
- `**/*.config.*`
- `dist/`
- `coverage/`

## Next Steps

1. **Run initial tests**
   ```bash
   npm install
   npm test
   ```

2. **Add tests for your changes**
   - Create `YourFile.test.ts` next to `YourFile.ts`
   - Write tests for new features
   - Maintain coverage above 70%

3. **Run before committing**
   ```bash
   npm run test:run
   npm run test:coverage
   npm run lint
   ```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Jest API Reference](https://jestjs.io/docs/api) (Vitest is compatible)

---

**Last Updated**: 2025-11-13
**Test Framework**: Vitest 2.0
**Coverage Target**: 70%
**Total Tests**: Growing! Start contributing tests today!
