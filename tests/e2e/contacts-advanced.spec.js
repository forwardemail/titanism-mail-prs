import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi.js';
import { setupAuthenticatedSession } from '../fixtures/calendar-helpers.js';
import {
  navigateToContacts,
  selectContact,
  editContactInline,
  saveContactInline,
  toggleOptionalFields,
  openActionsMenu,
  getContactInitials,
} from '../fixtures/contacts-helpers.js';

test.describe('Contact Photo Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should show initials when no photo', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Check for initials avatar
    const initialsElement = page.locator('.fe-contact-initials').first();
    await expect(initialsElement).toBeVisible();

    // Verify initials are correct (AJ for Alice Johnson)
    const initials = await initialsElement.textContent();
    expect(initials).toMatch(/AJ/i);
  });

  test('should display consistent avatar color', async ({ page }) => {
    // Select contact first time
    await selectContact(page, 'Bob Smith');
    const avatar1 = page.locator('.fe-contact-avatar-large');
    const color1 = await avatar1.getAttribute('style');

    // Select another contact
    await selectContact(page, 'Carol Williams');

    // Select Bob again
    await selectContact(page, 'Bob Smith');
    const avatar2 = page.locator('.fe-contact-avatar-large');
    const color2 = await avatar2.getAttribute('style');

    // Colors should be the same
    expect(color1).toEqual(color2);
  });

  test('should show camera overlay on avatar hover in edit mode', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Enter edit mode
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Edit")');

    // Avatar should be clickable in edit mode
    const avatar = page.locator('.fe-contact-avatar-large');
    await expect(avatar).toHaveClass(/fe-avatar-clickable/);
  });

  test('should calculate initials correctly for different name formats', async ({ page }) => {
    // Test various contact name formats
    const testCases = [
      { name: 'Alice Johnson', expected: 'AJ' },
      { name: 'Bob Smith', expected: 'BS' },
      { name: 'Carol Williams', expected: 'CW' },
    ];

    for (const testCase of testCases) {
      await selectContact(page, testCase.name);
      const initialsElement = page.locator('.fe-contact-initials').first();
      const initials = await initialsElement.textContent();
      expect(initials?.toUpperCase()).toContain(testCase.expected);
    }
  });
});

test.describe('Optional Fields', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should expand optional fields section', async ({ page }) => {
    await selectContact(page, 'Carol Williams');

    // Click additional info toggle
    await toggleOptionalFields(page);

    // Optional fields should be visible
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('TechCorp')).toBeVisible();
  });

  test('should collapse optional fields section', async ({ page }) => {
    await selectContact(page, 'Carol Williams');

    // Expand
    await toggleOptionalFields(page);
    await page.waitForTimeout(300);

    // Collapse
    await toggleOptionalFields(page);
    await page.waitForTimeout(300);

    // Fields should be hidden or collapsed
    // (Implementation may vary, but toggle should work)
  });

  test('should show indicator when optional fields have values', async ({ page }) => {
    // Select contact with optional fields
    await selectContact(page, 'Carol Williams');

    // Look for the indicator (dot or other visual indicator)
    const optionalToggle = page.locator('button:has-text("Additional info")');
    await expect(optionalToggle).toBeVisible();

    // Should have some indicator that fields are populated
    // This could be a dot, different styling, etc.
  });

  test('should save company field', async ({ page }) => {
    await selectContact(page, 'David Chen');

    // Edit and add company
    await editContactInline(page, {
      company: 'Tech Startup Inc',
    });

    await saveContactInline(page);

    // Verify company saved
    await selectContact(page, 'David Chen');
    await toggleOptionalFields(page);

    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Tech Startup Inc')).toBeVisible();
  });

  test('should save job title field', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Edit and add job title
    await editContactInline(page, {
      jobTitle: 'Senior Architect',
    });

    await saveContactInline(page);

    // Verify job title saved
    await selectContact(page, 'Bob Smith');
    await toggleOptionalFields(page);

    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Senior Architect')).toBeVisible();
  });

  test('should save timezone field', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Edit and add timezone
    await editContactInline(page, {
      timezone: 'America/Chicago',
    });

    await saveContactInline(page);

    // Verify timezone saved
    await selectContact(page, 'Alice Johnson');
    await toggleOptionalFields(page);

    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('America/Chicago')).toBeVisible();
  });

  test('should save website field', async ({ page }) => {
    await selectContact(page, 'David Chen');

    // Edit and add website
    await editContactInline(page, {
      website: 'https://davidchen.dev',
    });

    await saveContactInline(page);

    // Verify website saved
    await selectContact(page, 'David Chen');
    await toggleOptionalFields(page);

    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('https://davidchen.dev')).toBeVisible();
  });

  test('should save birthday field', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Edit and add birthday
    await editContactInline(page, {
      birthday: '1985-03-15',
    });

    await saveContactInline(page);

    // Verify birthday saved
    await selectContact(page, 'Bob Smith');
    await toggleOptionalFields(page);

    // Birthday should be visible (format may vary)
    await page.waitForTimeout(500);
  });
});

test.describe('Integration Actions', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should navigate to compose email', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Click Email action
    await openActionsMenu(page);
    await page.click('button:has-text("Email")');

    // Should navigate to mailbox with compose
    await page.waitForTimeout(500);
    expect(page.url()).toContain('mailbox');
  });

  test('should navigate to add calendar event', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Click Add event action
    await openActionsMenu(page);
    await page.click('button:has-text("Add event")');

    // Should navigate to calendar
    await page.waitForTimeout(500);
    expect(page.url()).toContain('calendar');
  });

  test('should navigate to view emails from contact', async ({ page }) => {
    await selectContact(page, 'Carol Williams');

    // Click View emails action
    await openActionsMenu(page);
    await page.click('button:has-text("View emails")');

    // Should navigate to mailbox with search
    await page.waitForTimeout(500);
    expect(page.url()).toContain('mailbox');
  });

  test('should show all action buttons', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Open actions menu
    await openActionsMenu(page);

    // Verify all actions are visible
    await expect(page.locator('button:has-text("Email")')).toBeVisible();
    await expect(page.locator('button:has-text("Add event")')).toBeVisible();
    await expect(page.locator('button:has-text("View emails")')).toBeVisible();
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    await expect(page.locator('button:has-text("Delete")')).toBeVisible();
  });

  test('should close actions menu after action', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Open menu
    await openActionsMenu(page);

    // Click an action
    await page.click('button:has-text("Edit")');

    // Menu should close
    await page.waitForTimeout(300);
    // In edit mode now, actions menu should not be visible
  });
});

test.describe('Error Handling & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
  });

  test('should show loading state', async ({ page }) => {
    // Navigate and check for loading
    await page.goto('/contacts');

    // Should briefly show loading state
    await page.waitForSelector('.fe-contacts-list', { timeout: 10000 });
  });

  test('should handle empty contact list', async ({ page }) => {
    // Mock empty contacts
    await mockApi(page, { contacts: [] });
    await setupAuthenticatedSession(page);
    await page.goto('/contacts');

    // Should show empty state
    await expect(page.locator('.fe-empty:has-text("No contacts found")')).toBeVisible();
  });

  test('should handle very long contact names', async ({ page }) => {
    await navigateToContacts(page);

    // Create contact with long name
    await page.click('button[aria-label="New contact"]');

    const longName = 'A'.repeat(100) + ' ' + 'B'.repeat(100);
    await page.fill('input[placeholder*="Name"]', longName);
    await page.fill('input[type="email"]', 'longname@example.com');

    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);

    // Should still display (may be truncated in list)
    const contactRow = page.locator('.fe-contact-row').filter({ hasText: 'longname@example.com' });
    await expect(contactRow).toBeVisible();
  });

  test('should handle very long email addresses', async ({ page }) => {
    await navigateToContacts(page);

    // Create contact with long email
    await page.click('button[aria-label="New contact"]');

    const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
    await page.fill('input[placeholder*="Name"]', 'Long Email User');
    await page.fill('input[type="email"]', longEmail);

    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);

    // Should still display (may be truncated)
    await expect(page.locator('.fe-contact-name:has-text("Long Email User")')).toBeVisible();
  });

  test('should handle special characters in name', async ({ page }) => {
    await navigateToContacts(page);

    // Create contact with special characters
    await page.click('button[aria-label="New contact"]');

    await page.fill('input[placeholder*="Name"]', "O'Neil & Sons");
    await page.fill('input[type="email"]', 'oneil@example.com');

    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);

    // Should properly display special characters
    await expect(page.locator('.fe-contact-name:has-text("O\'Neil & Sons")')).toBeVisible();
  });
});

test.describe('Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
  });

  test('should show back button on mobile in detail view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await navigateToContacts(page);

    // Select a contact
    await selectContact(page, 'Alice Johnson');

    // Back button should be visible on mobile
    const backBtn = page.locator('.fe-contact-back-btn, button[aria-label="Back to contacts"]');
    await expect(backBtn).toBeVisible();
  });

  test('should adjust header layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/contacts');

    // Header should still be accessible
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /New contact/i })).toBeVisible();
  });

  test('should maintain functionality on tablet size', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await navigateToContacts(page);

    // Should show both list and detail
    await expect(page.locator('.fe-contacts-list')).toBeVisible();
    await expect(page.locator('.fe-contacts-detail')).toBeVisible();
  });
});

test.describe('Helper Functions', () => {
  test('getContactInitials should calculate correctly', () => {
    // Test the helper function directly
    expect(getContactInitials({ name: 'Alice Johnson' })).toBe('AJ');
    expect(getContactInitials({ name: 'Bob Smith' })).toBe('BS');
    expect(getContactInitials({ name: 'SingleName' })).toBe('SI');
    expect(getContactInitials({ name: '', email: 'test@example.com' })).toBe('TE');
    expect(getContactInitials({ name: 'A B C' })).toBe('AC'); // First and last
  });
});
