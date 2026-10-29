const { defineConfig } = require('@playwright/test');
const sample = process.env.SAMPLE_PORT || 4001;
module.exports = defineConfig({
  testDir: './runs',
  outputDir: './runs/.artifacts',
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  reporter: [['json']],
  use: {
    baseURL: 'http://localhost:' + sample,
    actionTimeout: 8000,
    navigationTimeout: 10000,
    headless: true
  }
});
