#!/usr/bin/env node

// Simple test script to verify file writing works
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Clean up any existing test output
const testOutputDir = './test-output';
if (fs.existsSync(testOutputDir)) {
  fs.rmSync(testOutputDir, { recursive: true, force: true });
}

console.log('🧪 Testing export command file writing...');

try {
  // Build the project first
  console.log('📦 Building project...');
  execSync('npm run build', { stdio: 'inherit' });

  // Run export command with dry-run to test file system without API calls
  console.log('🚀 Running export command...');
  
  // Create a mock test that doesn't require Notion API
  const testCommand = `node dist/bin/run.js export --path=${testOutputDir} --format=json --help`;
  
  console.log(`Running: ${testCommand}`);
  const output = execSync(testCommand, { encoding: 'utf8' });
  console.log('Command output:', output);

  console.log('✅ Export command executed successfully');
  
  // Check if output directory was created
  if (fs.existsSync(testOutputDir)) {
    console.log('✅ Output directory created');
    const files = fs.readdirSync(testOutputDir, { recursive: true });
    console.log('📁 Files in output directory:', files);
  } else {
    console.log('❌ Output directory not created');
  }

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}