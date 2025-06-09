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
    
    // Mock fs.mkdir to succeed
    fs.mkdir.mockResolvedValue(undefined);
    
    // Mock fs.cp to succeed
    fs.cp = jest.fn().mockResolvedValue(undefined);
    
    // Mock fs.readdir to return files and directories
    fs.readdir.mockResolvedValue([
      'file1.js',
      'directory'
    ]);
    
    // Mock AdmZip constructor and methods
    const mockZipInstance = {
      addLocalFolder: jest.fn(),
      writeZip: jest.fn()
    };
    AdmZip.mockImplementation(() => mockZipInstance);
    
    // Mock core methods
    core.info = jest.fn();
    core.error = jest.fn();
  });

  test('should successfully package artifacts', async () => {
    const artifactsDir = '/mock/artifacts';
    const result = await packageCodeArtifacts(artifactsDir);
    
    // Check temp directory creation
    expect(fs.mkdir).toHaveBeenCalledWith('/mock/cwd/lambda-package', { recursive: true });
    
    // Check readdir was called for the artifacts directory
    expect(fs.readdir).toHaveBeenCalledWith(artifactsDir);
    
    // Check fs.cp was called for each top-level file/directory with recursive flag
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/file1.js', 
      '/mock/cwd/lambda-package/file1.js', 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/directory', 
      '/mock/cwd/lambda-package/directory', 
      { recursive: true }
    );
    
    // Check zip creation
    const zipInstance = AdmZip.mock.results[0].value;
    expect(zipInstance.addLocalFolder).toHaveBeenCalledWith('/mock/cwd/lambda-package');
    expect(zipInstance.writeZip).toHaveBeenCalledWith('/mock/cwd/lambda-function.zip');
    
    // Check logs were written
    expect(core.info).toHaveBeenCalledWith('Creating ZIP file');
    
    // Check return value
    expect(result).toBe('/mock/cwd/lambda-function.zip');
  });

  test('should handle nested directory structures', async () => {
    // Set up readdir to return different files
    fs.readdir.mockResolvedValue([
      'file1.js',
      'dir1'
    ]);
    
    const artifactsDir = '/mock/artifacts';
    await packageCodeArtifacts(artifactsDir);
    
    // Check fs.cp was called for top-level items with recursive flag
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/file1.js', 
      '/mock/cwd/lambda-package/file1.js', 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/dir1', 
      '/mock/cwd/lambda-package/dir1', 
      { recursive: true }
    );
  });

  test('should handle files with hidden/dot files', async () => {
    // Set up readdir to return hidden files
    fs.readdir.mockResolvedValue([
      'file1.js',
      '.env',
      '.config'
    ]);
    
    const artifactsDir = '/mock/artifacts';
    await packageCodeArtifacts(artifactsDir);
    
    // Check fs.cp was called for hidden files with recursive flag
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/.env', 
      '/mock/cwd/lambda-package/.env', 
      { recursive: true }
    );
    expect(fs.cp).toHaveBeenCalledWith(
      '/mock/artifacts/.config', 
      '/mock/cwd/lambda-package/.config', 
      { recursive: true }
    );
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
      writeZip: jest.fn().mockImplementation(() => {
        throw new Error('Failed to write zip');
      })
    };
    AdmZip.mockImplementation(() => mockZipInstance);
    
    const artifactsDir = '/mock/artifacts';
    
    // Expect the function to reject with the error
    await expect(packageCodeArtifacts(artifactsDir)).rejects.toThrow('Failed to write zip');
    
    // Check error was logged
    expect(core.error).toHaveBeenCalledWith('Failed to package artifacts: Failed to write zip');
  });
});
