const { packageCodeArtifacts } = require('../index');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const core = require('@actions/core');

// This test verifies that the ZIP files created can be properly unzipped
// It uses actual file operations, not mocks

describe('ZIP file integrity tests', () => {
  // Create temp directories for test
  let tempDir;
  let artifactsDir;
  let extractDir;
  let originalCwd;

  beforeAll(() => {
    // Save original working directory
    originalCwd = process.cwd();
    
    // Create a unique temporary directory for our tests
    tempDir = path.join(os.tmpdir(), `lambda-test-${Date.now()}`);
    fsSync.mkdirSync(tempDir, { recursive: true });
    
    // Change working directory to our temp dir for tests
    process.chdir(tempDir);
    
    // Create dirs we'll use for testing
    artifactsDir = path.join(tempDir, 'artifacts');
    extractDir = path.join(tempDir, 'extracted');
    
    fsSync.mkdirSync(artifactsDir, { recursive: true });
    fsSync.mkdirSync(extractDir, { recursive: true });
    
    // Mock core.info to prevent console noise during tests
    core.info = jest.fn();
    core.error = jest.fn();
  });

  afterAll(async () => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up test directories
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directories:', error);
    }
  });

  // Helper function to create test files
  async function createTestFiles(baseDir) {
    // Create a simple JS file
    await fs.writeFile(
      path.join(baseDir, 'index.js'),
      'console.log("Hello from Lambda");'
    );
    
    // Create a nested directory with another file
    const nestedDir = path.join(baseDir, 'lib');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(
      path.join(nestedDir, 'helper.js'),
      'exports.helper = () => "I am a helper";'
    );
    
    // Create a package.json file
    await fs.writeFile(
      path.join(baseDir, 'package.json'),
      JSON.stringify({
        name: "lambda-test",
        version: "1.0.0",
        main: "index.js"
      })
    );
  }

  // Helper function to compare directories recursively
  async function compareDirectories(dir1, dir2) {
    const results = [];
    
    async function traverse(relPath) {
      const fullPath1 = path.join(dir1, relPath);
      const fullPath2 = path.join(dir2, relPath);
      
      const stats1 = await fs.stat(fullPath1);
      
      if (stats1.isDirectory()) {
        const files = await fs.readdir(fullPath1);
        for (const file of files) {
          await traverse(path.join(relPath, file));
        }
      } else {
        // Compare file content
        try {
          const content1 = await fs.readFile(fullPath1, 'utf-8');
          const content2 = await fs.readFile(fullPath2, 'utf-8');
          
          results.push({
            path: relPath,
            match: content1 === content2
          });
        } catch (error) {
          results.push({
            path: relPath,
            match: false,
            error: error.message
          });
        }
      }
    }
    
    await traverse('');
    return results;
  }

  test('should create a ZIP file that can be unzipped successfully', async () => {
    // Create test files
    await createTestFiles(artifactsDir);
    
    // Call the packageCodeArtifacts function
    const zipPath = await packageCodeArtifacts(artifactsDir);
    
    // Verify the ZIP file exists
    const zipExists = fsSync.existsSync(zipPath);
    expect(zipExists).toBe(true);
    
    // Try to unzip the file
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    
    // Verify extracted files exist
    expect(fsSync.existsSync(path.join(extractDir, 'index.js'))).toBe(true);
    expect(fsSync.existsSync(path.join(extractDir, 'lib/helper.js'))).toBe(true);
    expect(fsSync.existsSync(path.join(extractDir, 'package.json'))).toBe(true);
    
    // Read the extracted files and compare content
    const extractedIndexJs = await fs.readFile(path.join(extractDir, 'index.js'), 'utf-8');
    expect(extractedIndexJs).toBe('console.log("Hello from Lambda");');
    
    const extractedHelperJs = await fs.readFile(path.join(extractDir, 'lib/helper.js'), 'utf-8');
    expect(extractedHelperJs).toBe('exports.helper = () => "I am a helper";');
  });

  test('ZIP file should have correct file structure for AWS Lambda', async () => {
    // Create test files
    await createTestFiles(artifactsDir);
    
    // Call the packageCodeArtifacts function
    const zipPath = await packageCodeArtifacts(artifactsDir);
    
    // Examine ZIP structure directly
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    
    // Get entry names
    const entryNames = entries.map(entry => entry.entryName);
    
    // Verify expected file structure
    expect(entryNames).toContain('index.js');
    expect(entryNames).toContain('lib/helper.js');
    expect(entryNames).toContain('package.json');
    
    // Verify contents of each file
    const indexJsEntry = zip.getEntry('index.js');
    expect(indexJsEntry).not.toBeNull();
    expect(indexJsEntry.getData().toString('utf8')).toBe('console.log("Hello from Lambda");');
    
    const helperJsEntry = zip.getEntry('lib/helper.js');
    expect(helperJsEntry).not.toBeNull();
    expect(helperJsEntry.getData().toString('utf8')).toBe('exports.helper = () => "I am a helper";');
    
    // Verify Lambda can read this ZIP format
    // This just tests that the ZIP has the expected structure and content,
    // which is what Lambda would expect
  });
  
  test('ZIP file can be converted to Base64 and back to validate AWS Lambda compatibility', async () => {
    // Create test files with slightly larger content to better test Base64 encoding
    const nestedDir = path.join(artifactsDir, 'src');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(
      path.join(artifactsDir, 'index.js'),
      `// Main Lambda handler
exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));
  const helper = require('./src/helper');
  const result = helper.process(event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Success", data: result })
  };
};`
    );
    
    await fs.writeFile(
      path.join(nestedDir, 'helper.js'),
      `// Helper module
exports.process = (input) => {
  return {
    processed: true,
    timestamp: new Date().toISOString(),
    input: input
  };
};`
    );
    
    // Create the ZIP file
    const zipPath = await packageCodeArtifacts(artifactsDir);
    
    // Read the ZIP file as a buffer
    const zipBuffer = await fs.readFile(zipPath);
    
    // Convert to base64
    const base64Content = zipBuffer.toString('base64');
    
    // Validate base64 format
    expect(base64Content).toMatch(/^[A-Za-z0-9+/=]+$/);
    
    // Convert back to a buffer
    const decodedBuffer = Buffer.from(base64Content, 'base64');
    
    // Write to a new file for testing
    const decodedZipPath = path.join(tempDir, 'decoded.zip');
    await fs.writeFile(decodedZipPath, decodedBuffer);
    
    // Try to unzip the decoded file
    const decodedExtractPath = path.join(tempDir, 'decoded-extract');
    await fs.mkdir(decodedExtractPath, { recursive: true });
    
    const decodedZip = new AdmZip(decodedZipPath);
    decodedZip.extractAllTo(decodedExtractPath, true);
    
    // Verify extracted files
    expect(fsSync.existsSync(path.join(decodedExtractPath, 'index.js'))).toBe(true);
    expect(fsSync.existsSync(path.join(decodedExtractPath, 'src/helper.js'))).toBe(true);
    
    // Read the extracted files and compare content
    const extractedIndexJs = await fs.readFile(path.join(decodedExtractPath, 'index.js'), 'utf-8');
    expect(extractedIndexJs).toContain('exports.handler');
    
    const extractedHelperJs = await fs.readFile(path.join(decodedExtractPath, 'src/helper.js'), 'utf-8');
    expect(extractedHelperJs).toContain('exports.process');
  });
});
