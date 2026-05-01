import { defineConfig, devices } from '@playwright/test'

const port = 5174

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-e2e' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'on',
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro相当（モバイルファースト）
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: true,
    cwd: '.',
  },
})
