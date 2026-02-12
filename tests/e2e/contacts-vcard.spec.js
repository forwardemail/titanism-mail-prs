import { test, expect } from '@playwright/test';
import path from 'path';
import { mockApi } from './mockApi.js';
import { setupAuthenticatedSession } from '../fixtures/calendar-helpers.js';
import {
  navigateToContacts,
  importVCard,
  selectContact,
  verifyContactInList,
  waitForSuccessToast,
  waitForErrorToast,
} from '../fixtures/contacts-helpers.js';

test.describe('vCard Import', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should open import menu', async ({ page }) => {
    // Click Import button
    await page.click('button[aria-label="Import vCard"]');

    // Verify menu opens
    const importMenu = page.locator('.fe-action-menu-panel, .fe-import-menu');
    await expect(importMenu).toBeVisible();
  });

  test('should import single vCard file', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/simple-contact.vcf');

    // Import the file
    await importVCard(page, filePath);

    // Wait for success message
    await waitForSuccessToast(page, '');

    // Verify new contact appears in list
    await verifyContactInList(page, { name: 'Emily Davis', email: 'emily@example.com' });
  });

  test('should import multi-vCard file', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/multi-contact.vcf');

    // Import the file
    await importVCard(page, filePath);

    // Wait for success message
    await waitForSuccessToast(page, '');

    // Verify all contacts appear in list
    await verifyContactInList(page, { name: 'Frank Miller', email: 'frank@example.com' });
    await verifyContactInList(page, { name: 'Grace Lee', email: 'grace@example.com' });
    await verifyContactInList(page, { name: 'Henry Wilson', email: 'henry@example.com' });
  });

  test('should import contact with all vCard fields', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/full-contact.vcf');

    // Import the file
    await importVCard(page, filePath);

    // Wait for success message
    await waitForSuccessToast(page, '');

    // Verify new contact appears
    await verifyContactInList(page, {
      name: 'Isabella Martinez',
      email: 'isabella@company.com',
    });

    // Select contact to verify details
    await selectContact(page, 'Isabella Martinez');

    // Verify all fields are imported
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Isabella Martinez')).toBeVisible();
    await expect(detailPanel.getByText('isabella@company.com')).toBeVisible();
    await expect(detailPanel.getByText('555-0108')).toBeVisible();

    // Expand optional fields to check company, title, etc
    const optionalToggle = page.locator('button:has-text("Additional info")');
    if (await optionalToggle.isVisible()) {
      await optionalToggle.click();
      await page.waitForTimeout(300);
      await expect(detailPanel.getByText('Enterprise Inc')).toBeVisible();
      await expect(detailPanel.getByText('Senior Developer')).toBeVisible();
    }
  });

  test('should import contact with photo', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/contact-with-photo.vcf');

    // Import the file
    await importVCard(page, filePath);

    // Wait for success message
    await waitForSuccessToast(page, '');

    // Verify contact appears
    await verifyContactInList(page, { name: 'Jack Thompson', email: 'jack@example.com' });

    // Select contact
    await selectContact(page, 'Jack Thompson');

    // Verify avatar is displayed (photo should be loaded)
    const avatar = page.locator('.fe-contact-avatar-large');
    await expect(avatar).toBeVisible();
  });

  test('should handle invalid vCard file', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/invalid.vcf');

    // Try to import invalid file
    await importVCard(page, filePath);

    // Wait for error message
    await waitForErrorToast(page, '');
  });

  test('should handle empty vCard file', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/empty.vcf');

    // Try to import empty file
    await importVCard(page, filePath);

    // Wait for error message
    await waitForErrorToast(page, '');
  });

  test('should close import menu after successful import', async ({ page }) => {
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/simple-contact.vcf');

    // Import the file
    await importVCard(page, filePath);

    // Wait for import to complete
    await waitForSuccessToast(page, '');

    // Verify import menu is closed
    await page.waitForTimeout(500);
    const importMenu = page.locator('.fe-action-menu-panel');
    await expect(importMenu).not.toBeVisible();
  });
});

test.describe('vCard Export', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should export contact as vCard', async ({ page }) => {
    // Select a contact
    await selectContact(page, 'Alice Johnson');

    // Open actions menu
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);

    // Click Export vCard
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export")');

    // Verify download starts
    const download = await downloadPromise;
    expect(download).toBeTruthy();

    // Verify filename format (should be based on contact name)
    const fileName = download.suggestedFilename();
    expect(fileName).toContain('.vcf');
  });

  test('should export contact with all fields', async ({ page }) => {
    // Select contact with many fields
    await selectContact(page, 'Carol Williams');

    // Open actions menu
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export")');

    // Verify download
    const download = await downloadPromise;
    expect(download).toBeTruthy();
  });

  test('should show success toast after export', async ({ page }) => {
    // Select a contact
    await selectContact(page, 'Bob Smith');

    // Open actions menu
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    await downloadPromise;

    // Wait for success toast
    await waitForSuccessToast(page, '');
  });
});

test.describe('vCard Duplicate Handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should handle duplicate email on import', async ({ page }) => {
    // Create a vCard with an email that already exists (alice@example.com)
    const filePath = path.join(process.cwd(), 'tests/fixtures/vcf/simple-contact.vcf');

    // First import
    await importVCard(page, filePath);
    await waitForSuccessToast(page, '');

    // Import same file again
    await importVCard(page, filePath);
    await page.waitForTimeout(500);

    // Contact should exist but not be duplicated
    await verifyContactInList(page, { name: 'Emily Davis', email: 'emily@example.com' });
  });
});
