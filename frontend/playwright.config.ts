import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--font-render-hinting=none'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1180 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: !process.env.CI,
    cwd: '.',
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.visual.baseline.signature',
      VITE_API_BASE_URL: 'http://127.0.0.1:8000',
    },
  },
})
