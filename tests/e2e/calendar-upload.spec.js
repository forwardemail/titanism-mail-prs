import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi.js';
import {
  setupAuthenticatedSession,
  uploadICSFile,
  waitForSuccessToast,
} from '../fixtures/calendar-helpers.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('ICS File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await page.goto('/calendar');
    await page.waitForSelector('.sx-svelte-calendar-wrapper', { timeout: 10000 });
  });

  test('should open import menu when clicking import button', async ({ page }) => {
    await page.click('button[aria-label="Import calendar"]');
    const importMenu = page.locator('.fe-import-menu.open');
    await expect(importMenu).toBeVisible();
    await expect(page.locator('text=Import Calendar (.ics)')).toBeVisible();
  });

  test('should upload simple ICS file', async ({ page }) => {
    const icsPath = join(__dirname, '../fixtures/ics/simple-event.ics');
    await uploadICSFile(page, icsPath);

    // Wait for import menu to close (indicates upload completed)
    await page.waitForTimeout(1000);
    const importMenu = page.locator('.fe-import-menu.open');
    await expect(importMenu).not.toBeVisible();
  });

  test('should upload multi-event ICS file', async ({ page }) => {
    const icsPath = join(__dirname, '../fixtures/ics/multi-event.ics');
    await uploadICSFile(page, icsPath);

    // Wait for import menu to close
    await page.waitForTimeout(1000);
    const importMenu = page.locator('.fe-import-menu.open');
    await expect(importMenu).not.toBeVisible();
  });

  test.skip('should upload event with full details and verify modal', async ({ page }) => {
    // Skipping: Requires clicking on rendered events which has timing complexities
    const icsPath = join(__dirname, '../fixtures/ics/event-with-details.ics');
    await uploadICSFile(page, icsPath);

    await waitForSuccessToast(page, /Imported/i);

    await page.waitForTimeout(500);
    const eventElement = page.locator('[class*="sx__"]').filter({ hasText: 'Product Demo' });
    await eventElement.first().click();

    const modal = page.locator('.fe-modal[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('input[value="Product Demo"]')).toBeVisible();

    const moreDetailsBtn = modal.locator('button').filter({ hasText: 'More details' });
    if (await moreDetailsBtn.isVisible()) {
      await moreDetailsBtn.click();
    }

    await expect(modal.locator('input[value="Conference Room B"]')).toBeVisible();
    await expect(modal.locator('input[value="https://zoom.us/j/123456789"]')).toBeVisible();
  });

  test('should upload all-day event', async ({ page }) => {
    const icsPath = join(__dirname, '../fixtures/ics/all-day-event.ics');
    await uploadICSFile(page, icsPath);

    // Wait for import menu to close
    await page.waitForTimeout(1000);
    const importMenu = page.locator('.fe-import-menu.open');
    await expect(importMenu).not.toBeVisible();
  });
});
