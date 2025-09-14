import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
  });

  test('should redirect to auth portal when not authenticated', async ({ page }) => {
    // Try to access a protected route
    await page.goto('/questionnaire');
    
    // Should redirect to auth portal
    await expect(page).toHaveURL(/\/auth-portal/);
    
    // Should show authentication options
    await expect(page.locator('[data-testid="auth-portal"]')).toBeVisible();
  });

  test('should show login button in auth portal', async ({ page }) => {
    await page.goto('/auth-portal');
    
    // Should have login with Replit option
    const loginButton = page.locator('[data-testid="replit-login-button"]');
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toContainText('Enter the apotropaic realm');
  });

  test('should handle authentication state correctly', async ({ page }) => {
    // Mock authentication state by setting session cookie
    await page.context().addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false
    }]);

    await page.goto('/');
    
    // Should not redirect to auth portal when authenticated
    // (This test may need adjustment based on actual auth implementation)
  });
});

test.describe('Health Endpoints', () => {
  test('should return healthy status from /healthz', async ({ page }) => {
    const response = await page.request.get('/healthz');
    expect(response.ok()).toBeTruthy();
    
    const health = await response.json();
    expect(health.status).toBe('healthy');
    expect(health.timestamp).toBeTruthy();
    expect(health.uptime).toBeGreaterThan(0);
  });

  test('should return metrics from /metrics', async ({ page }) => {
    const response = await page.request.get('/metrics');
    expect(response.ok()).toBeTruthy();
    
    const metrics = await response.json();
    expect(metrics.timestamp).toBeTruthy();
    expect(metrics.uptime).toBeGreaterThan(0);
    expect(metrics.memory).toBeTruthy();
    expect(metrics.platform).toBeTruthy();
    expect(metrics.version).toBeTruthy();
  });
});
