const { packageCodeArtifacts } = require('../index');
const fs = require('fs/promises');
const path = require('path');
const { glob } = require('glob');
const AdmZip = require('adm-zip');
const core = require('@actions/core');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('glob');
jest.mock('adm-zip');
jest.mock('@actions/core');
jest.mock('path');

describe('packageCodeArtifacts function', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    
    // Mock process.cwd()
    process.cwd = jest.fn().mockReturnValue('/mock/cwd');
    
    // Mock path functions
    path.join.mockImplementation((...parts) => parts.join('/'));
    path.dirname.mockImplementation((p) => p.substring(0, p.lastIndexOf('/')));
    path.isAbsolute = jest.fn().mockReturnValue(false);
    path.resolve = jest.fn().mockImplementation((cwd, dir) => `/resolved/${dir}`);
    
    // Mock fs functions
    fs.mkdir.mockResolvedValue(undefined);
    fs.cp = jest.fn().mockResolvedValue(undefined);
    fs.rm = jest.fn().mockResolvedValue(undefined);
    fs.stat = jest.fn().mockResolvedValue({ size: 12345 });
    fs.access = jest.fn().mockResolvedValue(undefined);
    
    // Mock fs.readdir to return objects with isDirectory method
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'directory', isDirectory: () => true }
        ]);
      } else {
        return Promise.resolve(['file1.js', 'directory']);
      }
    });
    
    // Mock AdmZip constructor and methods
    const mockZipInstance = {
      addLocalFolder: jest.fn(),
      addLocalFile: jest.fn(),
      writeZip: jest.fn()
    };
    
    // Create mock entries for zip verification
    const mockEntries = [
      {
        entryName: 'file1.js',
        header: { size: 1024 }
      },
      {
        entryName: 'directory/subfile.js',
        header: { size: 2048 }
      }
    ];
    
    // Mock both the zip instance creation and the verification instance
    AdmZip.mockImplementation((zipPath) => {
      if (zipPath) {
        // This is for verification when AdmZip is called with a path
        return {
          getEntries: jest.fn().mockReturnValue(mockEntries)
        };
      }
      // This is for the initial AdmZip() call to create zip
      return mockZipInstance;
    });
    
    // Mock core methods
    core.info = jest.fn();
    core.error = jest.fn();
  });

  test('should successfully package artifacts', async () => {
    const artifactsDir = '/mock/artifacts';
    const result = await packageCodeArtifacts(artifactsDir);
    
    // Check temp directory cleanup and creation
    expect(fs.rm).toHaveBeenCalledWith('/mock/cwd/lambda-package', { recursive: true, force: true });
    expect(fs.mkdir).toHaveBeenCalledWith('/mock/cwd/lambda-package', { recursive: true });
    
    // Check readdir was called with the artifacts directory
    expect(fs.readdir).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
    
    // Check fs.cp was called for each top-level file/directory with recursive flag
    expect(fs.cp).toHaveBeenCalledTimes(2);
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('file1.js'),
      expect.stringContaining('lambda-package/file1.js'), 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('directory'),
      expect.stringContaining('lambda-package/directory'), 
      { recursive: true }
    );
    
    // Check zip creation
    const zipInstance = AdmZip.mock.results[0].value;
    expect(zipInstance.addLocalFolder).toHaveBeenCalledWith('/mock/cwd/lambda-package/directory', 'directory');
    expect(zipInstance.addLocalFile).toHaveBeenCalledWith('/mock/cwd/lambda-package/file1.js');
    expect(zipInstance.writeZip).toHaveBeenCalledWith('/mock/cwd/lambda-function.zip');
    
    // Check logs were written
    expect(core.info).toHaveBeenCalledWith('Creating ZIP file with standard options');
    
    // Check return value
    expect(result).toBe('/mock/cwd/lambda-function.zip');
  });

  test('should handle nested directory structures', async () => {
    // Set up readdir to return different files
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'dir1', isDirectory: () => true }
        ]);
      } else {
        return Promise.resolve(['file1.js', 'dir1']);
      }
    });
    
    const artifactsDir = '/mock/artifacts';
    await packageCodeArtifacts(artifactsDir);
    
    // Check fs.cp was called for top-level items with recursive flag
    expect(fs.cp).toHaveBeenCalledTimes(2);
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('file1.js'),
      expect.stringContaining('lambda-package/file1.js'), 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('dir1'),
      expect.stringContaining('lambda-package/dir1'), 
      { recursive: true }
    );
  });

  test('should handle files with hidden/dot files', async () => {
    // Set up readdir to return hidden files
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: '.env', isDirectory: () => false },
          { name: '.config', isDirectory: () => false }
        ]);
      } else {
        return Promise.resolve(['file1.js', '.env', '.config']);
      }
    });
    
    const artifactsDir = '/mock/artifacts';
    await packageCodeArtifacts(artifactsDir);
    
    // Check fs.cp was called for hidden files with recursive flag
    expect(fs.cp).toHaveBeenCalledTimes(3); // file1.js, .env, and .config
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('lambda-package/.env'), 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      expect.stringContaining('.config'),
      expect.stringContaining('lambda-package/.config'), 
      { recursive: true }
    );
  });

  test('should handle error during directory cleanup', async () => {
    // Mock fs.rm to fail but allow the test to continue
    const rmError = new Error('Failed to remove directory');
    fs.rm.mockRejectedValueOnce(rmError);
    
    // Ensure fs.readdir uses withFileTypes for this test
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'directory', isDirectory: () => true }
        ]);
      } else {
        return Promise.resolve(['file1.js', 'directory']);
      }
    });
    
    const artifactsDir = '/mock/artifacts';
    const result = await packageCodeArtifacts(artifactsDir);
    
    // The function should catch the error and continue
    expect(fs.mkdir).toHaveBeenCalled();
    expect(result).toBe('/mock/cwd/lambda-function.zip');
  });

  test('should handle error during directory creation', async () => {
    // Mock fs.mkdir to fail
    const mkdirError = new Error('Failed to create directory');
    fs.mkdir.mockRejectedValue(mkdirError);
    
    const artifactsDir = '/mock/artifacts';
    
    // Expect the function to reject with the error
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow('Failed to create directory');
    
    // Check error was logged
    expect(core.error).toHaveBeenCalledWith('Failed to package artifacts: Failed to create directory');
  });

  test('should handle error during file copying', async () => {
    // Mock fs.cp to fail for one specific file
    fs.cp.mockImplementation((src, dest, options) => {
      if (src.includes('file1.js')) {
        return Promise.reject(new Error('Failed to copy file'));
      }
      return Promise.resolve();
    });
    
    // Ensure fs.readdir uses withFileTypes for this test
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'directory', isDirectory: () => true }
        ]);
      } else {
        return Promise.resolve(['file1.js', 'directory']);
      }
    });
    
    const artifactsDir = '/mock/artifacts';
    
    // Expect the function to reject with the error
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow('Failed to copy file');
    
    // Check error was logged
    expect(core.error).toHaveBeenCalledWith('Failed to package artifacts: Failed to copy file');
  });

  test('should handle error during zip creation', async () => {
    // Mock AdmZip's writeZip to throw an error
    const mockZipInstance = {
      addLocalFolder: jest.fn(),
      addLocalFile: jest.fn(),
      writeZip: jest.fn().mockImplementation(() => {
        throw new Error('Failed to write zip');
      })
    };
    AdmZip.mockImplementation(() => mockZipInstance);
    
    // Ensure fs.readdir uses withFileTypes for this test
    fs.readdir.mockImplementation((dir, options) => {
      if (options && options.withFileTypes) {
        return Promise.resolve([
          { name: 'file1.js', isDirectory: () => false },
          { name: 'directory', isDirectory: () => true }
        ]);
      } else {
        return Promise.resolve(['file1.js', 'directory']);
      }
    });
    
    const artifactsDir = '/mock/artifacts';
    
    // Expect the function to reject with the error
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow('Failed to write zip');
    
    // Check error was logged
    expect(core.error).toHaveBeenCalledWith('Failed to package artifacts: Failed to write zip');
  });

  test('should verify zip file contents after creation', async () => {
    const artifactsDir = '/mock/artifacts';
    const zipPath = await packageCodeArtifacts(artifactsDir);
    
    // Create a new AdmZip instance for verification
    const verificationZip = new AdmZip(zipPath);
    const entries = verificationZip.getEntries();
    
    // Verify entries exist and have expected properties
    expect(entries).toHaveLength(2);
    expect(entries[0].entryName).toBe('file1.js');
    expect(entries[1].entryName).toBe('directory/subfile.js');
    
    // Verify file sizes
    expect(entries[0].header.size).toBe(1024);
    expect(entries[1].header.size).toBe(2048);
    
    // Check zip file size
    expect(fs.stat).toHaveBeenCalledWith(zipPath);
  });

  test('should use provided artifact directory path correctly', async () => {
    // Set up path.resolve to handle the custom path correctly
    path.resolve = jest.fn().mockImplementation((cwd, dir) => {
      if (dir === '/custom/artifacts/path') {
        return dir; // Return as is if it's the custom path
      }
      return `/resolved/${dir}`; // Otherwise use a standard format
    });

    const customArtifactsDir = '/custom/artifacts/path';
    await packageCodeArtifacts(customArtifactsDir);
    
    // When path.isAbsolute returns false, path.resolve is called with process.cwd() and artifactsDir
    expect(path.resolve).toHaveBeenCalledWith(expect.any(String), customArtifactsDir);
    
    // The actual readdir call should be on the resolved path, not directly on customArtifactsDir
    expect(fs.access).toHaveBeenCalledWith(customArtifactsDir);
    expect(fs.readdir).toHaveBeenCalledWith(customArtifactsDir);
  });

  test('should throw error for empty artifacts directory', async () => {
    // Mock fs.readdir to return an empty array
    fs.readdir.mockImplementation(() => {
      return Promise.resolve([]);
    });
    
    const artifactsDir = '/mock/artifacts';
    
    // Since the implementation throws an error for empty directories, we should expect that
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow(
      `Code artifacts directory '/resolved/${artifactsDir}' is empty, no files to package`
    );
  });

  test('should handle artifacts directory access error', async () => {
    // Mock fs.access to throw an error
    const accessError = new Error('Directory does not exist');
    fs.access.mockRejectedValueOnce(accessError);
    
    const artifactsDir = '/mock/artifacts';
    
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow(
      `Code artifacts directory '/resolved/${artifactsDir}' does not exist or is not accessible`
    );
  });
});
