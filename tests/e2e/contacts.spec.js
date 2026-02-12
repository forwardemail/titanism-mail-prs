import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi.js';
import { setupAuthenticatedSession } from '../fixtures/calendar-helpers.js';
import { navigateToContacts, searchContacts, selectContact } from '../fixtures/contacts-helpers.js';

test.describe('Contacts Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
  });

  test('should show contacts header with actions', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /New contact/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import/i })).toBeVisible();
    await expect(page.locator('.fe-contacts-header button[aria-label="Back"]')).toBeVisible();
  });

  test('should display contacts list', async ({ page }) => {
    await navigateToContacts(page);
    const contactList = page.locator('.fe-contacts-list');
    await expect(contactList).toBeVisible();

    // Verify at least one contact is visible
    const contactRows = page.locator('.fe-contact-row');
    await expect(contactRows.first()).toBeVisible();
  });

  test('should show contact names and emails in list', async ({ page }) => {
    await navigateToContacts(page);
    const contactList = page.locator('.fe-contacts-list');

    // Verify mock contacts are displayed
    await expect(contactList.locator('.fe-contact-name:has-text("Alice Johnson")')).toBeVisible();
    await expect(
      contactList.locator('.fe-contact-email:has-text("alice@example.com")'),
    ).toBeVisible();
    await expect(contactList.locator('.fe-contact-name:has-text("Bob Smith")')).toBeVisible();
  });

  test('should select first contact by default', async ({ page }) => {
    await navigateToContacts(page);

    // First contact should have active class
    const firstContact = page.locator('.fe-contact-row').first();
    await expect(firstContact).toHaveClass(/active/);

    // Detail panel should show contact info
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel).toBeVisible();
  });

  test('should display contact detail panel', async ({ page }) => {
    await navigateToContacts(page);

    // Detail panel should be visible
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel).toBeVisible();

    // Should show contact information
    await expect(detailPanel.locator('.fe-contact-avatar-large')).toBeVisible();
  });
});

test.describe('Contacts Search', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should search contacts by name', async ({ page }) => {
    await searchContacts(page, 'Alice');
    const contactList = page.locator('.fe-contacts-list');

    // Should show only Alice
    await expect(contactList.locator('.fe-contact-name:has-text("Alice Johnson")')).toBeVisible();

    // Should not show other contacts
    await expect(contactList.locator('.fe-contact-name:has-text("Bob Smith")')).toHaveCount(0);
  });

  test('should search contacts by email', async ({ page }) => {
    await searchContacts(page, 'techcorp.com');
    const contactList = page.locator('.fe-contacts-list');

    // Should show only contact with techcorp email
    await expect(
      contactList.locator('.fe-contact-email:has-text("carol@techcorp.com")'),
    ).toBeVisible();

    // Should not show example.com contacts
    await expect(
      contactList.locator('.fe-contact-email:has-text("alice@example.com")'),
    ).toHaveCount(0);
  });

  test('should search contacts by company', async ({ page }) => {
    await searchContacts(page, 'Acme');
    const contactList = page.locator('.fe-contacts-list');

    // Should show contact from Acme Corp
    await expect(contactList.locator('.fe-contact-name:has-text("Alice Johnson")')).toBeVisible();

    // Should not show contacts from other companies
    await expect(contactList.locator('.fe-contact-name:has-text("David Chen")')).toHaveCount(0);
  });

  test('should show no contacts found when no matches', async ({ page }) => {
    await searchContacts(page, 'NonExistentContact12345');

    // Should show empty state
    await expect(page.locator('.fe-empty:has-text("No contacts found")')).toBeVisible();
  });

  test('should clear search and restore full list', async ({ page }) => {
    const contactList = page.locator('.fe-contacts-list');

    // First search for something
    await searchContacts(page, 'Alice');
    await expect(contactList.locator('.fe-contact-name:has-text("Alice Johnson")')).toBeVisible();
    await expect(contactList.locator('.fe-contact-name:has-text("Bob Smith")')).toHaveCount(0);

    // Clear search
    await searchContacts(page, '');

    // All contacts should be visible again
    await expect(contactList.locator('.fe-contact-name:has-text("Alice Johnson")')).toBeVisible();
    await expect(contactList.locator('.fe-contact-name:has-text("Bob Smith")')).toBeVisible();
    await expect(contactList.locator('.fe-contact-name:has-text("Carol Williams")')).toBeVisible();
  });
});

test.describe('Contact Selection', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should select different contact on click', async ({ page }) => {
    // Click second contact
    await selectContact(page, 'Bob Smith');

    // Bob should now have active class
    const bobRow = page.locator('.fe-contact-row:has-text("Bob Smith")');
    await expect(bobRow).toHaveClass(/active/);

    // Detail panel should show Bob's info
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Bob Smith')).toBeVisible();
  });

  test('should maintain selection across operations', async ({ page }) => {
    // Select a specific contact
    await selectContact(page, 'Carol Williams');

    // Verify it's selected
    const carolRow = page.locator('.fe-contact-row:has-text("Carol Williams")');
    await expect(carolRow).toHaveClass(/active/);

    // Detail panel should show Carol's info
    await expect(page.locator('.fe-contacts-detail').getByText('Carol Williams')).toBeVisible();
  });

  test('should show contact avatar with initials', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Check for avatar
    const avatar = page.locator('.fe-contact-avatar-large');
    await expect(avatar).toBeVisible();

    // Check for initials (AJ for Alice Johnson)
    const initials = page.locator('.fe-contact-initials');
    await expect(initials.first()).toBeVisible();
  });
});
