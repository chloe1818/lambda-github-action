const path = require('path');
const { validateAndResolvePath } = require('../validations');

describe('validateAndResolvePath function', () => {
  let originalPlatform;
  
  beforeAll(() => {
    // Store the original platform to restore it after tests
    originalPlatform = process.platform;
  });

  afterAll(() => {
    // Restore the original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
  });
  
  beforeEach(() => {
    // Mock process.cwd()
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
  });

  test('should resolve relative paths correctly', () => {
    const basePath = '/base/path';
    const relativePath = './subdir/file.js';
    
    const result = validateAndResolvePath(relativePath, basePath);
    
    expect(result).toBe('/base/path/subdir/file.js');
  });

  test('should allow absolute paths that are inside base path', () => {
    const basePath = '/base/path';
    const absolutePath = '/base/path/subdir/file.js';
    
    const result = validateAndResolvePath(absolutePath, basePath);
    
    expect(result).toBe('/base/path/subdir/file.js');
  });

  test('should handle paths with no traversal correctly', () => {
    const basePath = '/base/path';
    const safePath = 'subdir/file.js';
    
    const result = validateAndResolvePath(safePath, basePath);
    
    expect(result).toBe('/base/path/subdir/file.js');
  });

  test('should throw error for path traversal with ../', () => {
    const basePath = '/base/path';
    const maliciousPath = '../outside/file.js';
    
    expect(() => {
      validateAndResolvePath(maliciousPath, basePath);
    }).toThrow(/Security error: Path traversal attempt detected/);
  });

  test('should throw error for path traversal with multiple ../', () => {
    const basePath = '/base/path';
    const maliciousPath = 'subdir/../../outside/file.js';
    
    expect(() => {
      validateAndResolvePath(maliciousPath, basePath);
    }).toThrow(/Security error: Path traversal attempt detected/);
  });

  test('should throw error for absolute paths outside base path', () => {
    const basePath = '/base/path';
    const maliciousPath = '/outside/path/file.js';
    
    expect(() => {
      validateAndResolvePath(maliciousPath, basePath);
    }).toThrow(/Security error: Path traversal attempt detected/);
  });

  test('should normalize paths with redundant separators', () => {
    const basePath = '/base/path';
    const messyPath = 'subdir///nested//file.js';
    
    const result = validateAndResolvePath(messyPath, basePath);
    
    expect(result).toBe('/base/path/subdir/nested/file.js');
  });

  test('should handle Windows-style paths correctly on Windows platform', () => {
    // Mock Windows platform
    Object.defineProperty(process, 'platform', {
      value: 'win32'
    });
    
    // Path.normalize and path.resolve behave differently on Windows
    // This is a simplified test that assumes the implementation will use
    // the appropriate path function for the platform
    jest.mock('path', () => ({
      ...jest.requireActual('path'),
      normalize: jest.fn(p => p.replace(/\\/g, '/')),
      isAbsolute: jest.fn(p => p.startsWith('C:\\') || p.startsWith('/')),
      resolve: jest.fn((base, p) => `${base}/${p}`.replace(/\\/g, '/')),
      relative: jest.fn((from, to) => {
        if (to.startsWith('/outside')) return '../../outside';
        return to.replace(`${from}/`, '');
      })
    }));
    
    const basePath = 'C:\\base\\path';
    const windowsPath = 'subdir\\file.js';
    
    // Since we mocked the path functions, this is more of an integration test
    // checking the function handles the mocked Windows-like behavior correctly
    const validateAndResolvePath = require('../validations').validateAndResolvePath;
    expect(() => validateAndResolvePath(windowsPath, basePath)).not.toThrow();
  });
  
  test('should handle empty paths', () => {
    const basePath = '/base/path';
    const emptyPath = '';
    
    const result = validateAndResolvePath(emptyPath, basePath);
    
    // An empty path resolves to the base path itself
    expect(result).toBe('/base/path');
  });
  
  test('should handle current directory path', () => {
    const basePath = '/base/path';
    const currentDirPath = '.';
    
    const result = validateAndResolvePath(currentDirPath, basePath);
    
    expect(result).toBe('/base/path');
  });
  
  test('should handle special characters in paths', () => {
    const basePath = '/base/path';
    const specialCharsPath = 'subdir/file with spaces and $special#chars.js';
    
    const result = validateAndResolvePath(specialCharsPath, basePath);
    
    expect(result).toBe('/base/path/subdir/file with spaces and $special#chars.js');
  });
});
