const path = require('path');
const AdmZip = require('adm-zip');
const fs = require('fs/promises');

// Function to test our packaging code directly
async function testPackaging() {
  console.log('Starting packaging test...');
  
  // Paths
  const artifactsDir = './lambda-test-main/dist';
  const tempDir = path.join(process.cwd(), 'lambda-package');
  const zipPath = path.join(process.cwd(), 'lambda-function.zip');

  try {
    // Clean up and recreate temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.log('No directory to remove, continuing...');
    }
    
    await fs.mkdir(tempDir, { recursive: true });

    // Resolve the artifacts directory path
    const resolvedArtifactsDir = path.isAbsolute(artifactsDir) 
      ? artifactsDir 
      : path.resolve(process.cwd(), artifactsDir);
    
    console.log(`Copying artifacts from ${resolvedArtifactsDir} to ${tempDir}`);
    
    // Check if directory exists
    try {
      await fs.access(resolvedArtifactsDir);
    } catch (error) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' does not exist: ${error.message}`);
    }
    
    const files = await fs.readdir(resolvedArtifactsDir);
    
    if (files.length === 0) {
      throw new Error(`Code artifacts directory '${resolvedArtifactsDir}' is empty, no files to package`);
    }
    
    console.log(`Found ${files.length} files/directories to copy`);
    
    for (const file of files) {
      const sourcePath = path.join(resolvedArtifactsDir, file);
      const destPath = path.join(tempDir, file);
      
      console.log(`Copying ${sourcePath} to ${destPath}`);
      
      await fs.cp(
        sourcePath,
        destPath,
        { recursive: true }
      );
    }

    console.log('Creating ZIP file');
    const zip = new AdmZip();
    zip.addLocalFolder(tempDir);
    zip.writeZip(zipPath);
    
    // Check ZIP file size
    const stats = await fs.stat(zipPath);
    console.log(`Created ZIP file (${stats.size} bytes)`);

    // List contents of the zip
    const zipContents = zip.getEntries().map(entry => `${entry.entryName} (${entry.header.size} bytes)`);
    console.log('ZIP file contents:', zipContents);

    console.log('Test completed successfully!');
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
testPackaging();
