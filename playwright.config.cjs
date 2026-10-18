const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.cjs",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:8018",
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/browser-server.cjs",
    env: { TEST_PORT: "8018" },
    url: "http://127.0.0.1:8018",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
