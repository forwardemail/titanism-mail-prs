import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi.js';
import { setupAuthenticatedSession } from '../fixtures/calendar-helpers.js';
import {
  navigateToContacts,
  openNewContactModal,
  fillContactForm,
  selectContact,
  editContactInline,
  saveContactInline,
  cancelEditInline,
  verifyContactInList,
  verifyContactNotInList,
  waitForSuccessToast,
} from '../fixtures/contacts-helpers.js';

test.describe('Contact Creation - Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should open new contact modal on button click', async ({ page }) => {
    await openNewContactModal(page);

    // Verify modal is visible
    const modal = page.locator('.fe-modal[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verify title
    await expect(modal.getByText(/New contact/i)).toBeVisible();
  });

  test('should create contact with required fields only', async ({ page }) => {
    await openNewContactModal(page);

    // Fill required fields
    await fillContactForm(page, {
      name: 'Test User',
      email: 'test@example.com',
    });

    // Save
    await page.click('button:has-text("Save")');

    // Wait for modal to close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Wait for success toast
    await waitForSuccessToast(page, '');

    // Verify contact appears in list
    await verifyContactInList(page, { name: 'Test User', email: 'test@example.com' });
  });

  test('should create contact with all fields', async ({ page }) => {
    await openNewContactModal(page);

    // Fill all fields
    await fillContactForm(page, {
      name: 'Complete User',
      email: 'complete@example.com',
      phone: '555-9876',
      notes: 'Test contact with all fields',
      company: 'Test Corp',
      jobTitle: 'Tester',
      timezone: 'America/Chicago',
      website: 'https://test.com',
      birthday: '1990-05-15',
    });

    // Save
    await page.click('button:has-text("Save")');

    // Wait for modal to close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Verify contact appears in list
    await verifyContactInList(page, { name: 'Complete User', email: 'complete@example.com' });

    // Select the new contact
    await selectContact(page, 'Complete User');

    // Verify detail panel shows the info
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Complete User')).toBeVisible();
    await expect(detailPanel.getByText('complete@example.com')).toBeVisible();
  });

  test('should validate email is required', async ({ page }) => {
    await openNewContactModal(page);

    // Fill name but leave email empty
    await fillContactForm(page, {
      name: 'No Email User',
      email: '',
    });

    // Try to save
    await page.click('button:has-text("Save")');

    // Modal should stay open
    await page.waitForTimeout(500);
    const modal = page.locator('.fe-modal[role="dialog"]');
    await expect(modal).toBeVisible();
  });

  test('should cancel contact creation', async ({ page }) => {
    await openNewContactModal(page);

    // Fill some fields
    await fillContactForm(page, {
      name: 'Cancelled User',
      email: 'cancelled@example.com',
    });

    // Click Cancel
    await page.click('.fe-modal button:has-text("Cancel")');

    // Modal should close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Contact should not be created
    await verifyContactNotInList(page, 'Cancelled User');
  });

  test('should close modal on Escape key', async ({ page }) => {
    await openNewContactModal(page);

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });
  });
});

test.describe('Contact Update - Inline Editing', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should enable inline editing mode', async ({ page }) => {
    // Select a contact
    await selectContact(page, 'Alice Johnson');

    // Open actions menu and click Edit
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Edit")');

    // Verify edit mode is active - Save and Cancel buttons should appear
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
  });

  test('should update contact name', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Edit contact
    await editContactInline(page, {
      name: 'Robert Smith',
    });

    // Save
    await saveContactInline(page);

    // Verify name updated in list
    await verifyContactInList(page, { name: 'Robert Smith' });
  });

  test('should update contact email', async ({ page }) => {
    await selectContact(page, 'David Chen');

    // Edit email
    await editContactInline(page, {
      email: 'david.chen@startup.io',
    });

    // Save
    await saveContactInline(page);

    // Verify email updated
    await verifyContactInList(page, { email: 'david.chen@startup.io' });
  });

  test('should update contact phone', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Edit phone
    await editContactInline(page, {
      phone: '555-1111',
    });

    // Save
    await saveContactInline(page);

    // Select contact again to see details
    await selectContact(page, 'Alice Johnson');

    // Verify phone updated in detail panel
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('555-1111')).toBeVisible();
  });

  test('should update contact notes', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Edit notes
    await editContactInline(page, {
      notes: 'Updated notes for Bob',
    });

    // Save
    await saveContactInline(page);

    // Verify notes updated
    await selectContact(page, 'Bob Smith');
    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('Updated notes for Bob')).toBeVisible();
  });

  test('should update optional fields', async ({ page }) => {
    await selectContact(page, 'Carol Williams');

    // Edit optional fields
    await editContactInline(page, {
      company: 'TechCorp International',
      jobTitle: 'Senior Engineering Lead',
      timezone: 'America/Los_Angeles',
    });

    // Save
    await saveContactInline(page);

    // Verify optional fields updated
    await selectContact(page, 'Carol Williams');

    // Expand optional fields if needed
    const optionalToggle = page.locator('button:has-text("Additional info")');
    if (await optionalToggle.isVisible()) {
      await optionalToggle.click();
      await page.waitForTimeout(300);
    }

    const detailPanel = page.locator('.fe-contacts-detail');
    await expect(detailPanel.getByText('TechCorp International')).toBeVisible();
  });

  test('should cancel inline edit without saving', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Edit contact
    await editContactInline(page, {
      name: 'Changed Name',
    });

    // Cancel
    await cancelEditInline(page);

    // Verify name didn't change
    await expect(page.locator('.fe-contacts-detail').getByText('Alice Johnson')).toBeVisible();
    await expect(page.locator('.fe-contacts-detail').getByText('Changed Name')).not.toBeVisible();
  });

  test('should validate email on update', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Edit to clear email
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Edit")');

    // Try to clear email
    await page.fill('input[type="email"]', '');

    // Try to save
    await page.click('button:has-text("Save")');

    // Should stay in edit mode or show error
    await page.waitForTimeout(500);
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });
});

test.describe('Contact Deletion', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await setupAuthenticatedSession(page);
    await navigateToContacts(page);
  });

  test('should open delete confirmation dialog', async ({ page }) => {
    await selectContact(page, 'David Chen');

    // Open actions menu
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);

    // Click Delete
    await page.click('button:has-text("Delete")');

    // Verify confirmation modal appears
    const confirmModal = page.locator('.fe-modal[role="dialog"]');
    await expect(confirmModal).toBeVisible();

    // Should show contact name in confirmation
    await expect(confirmModal.getByText(/David Chen/)).toBeVisible();
  });

  test('should delete contact after confirmation', async ({ page }) => {
    await selectContact(page, 'David Chen');

    // Delete contact
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Delete")');

    // Confirm deletion
    const confirmModal = page.locator('.fe-modal[role="dialog"]');
    await confirmModal.locator('button:has-text("Delete")').click();

    // Wait for modal to close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Verify contact removed from list
    await verifyContactNotInList(page, 'David Chen');
  });

  test('should cancel deletion', async ({ page }) => {
    await selectContact(page, 'Bob Smith');

    // Open delete dialog
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Delete")');

    // Click Cancel
    const confirmModal = page.locator('.fe-modal[role="dialog"]');
    await confirmModal.locator('button:has-text("Cancel")').click();

    // Modal should close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Contact should still exist
    await verifyContactInList(page, { name: 'Bob Smith' });
  });

  test('should close delete dialog on Escape', async ({ page }) => {
    await selectContact(page, 'Alice Johnson');

    // Open delete dialog
    const actionsBtn = page.locator('.fe-contact-actions button').first();
    await actionsBtn.click();
    await page.waitForTimeout(200);
    await page.click('button:has-text("Delete")');

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });

    // Contact should still exist
    await verifyContactInList(page, { name: 'Alice Johnson' });
  });
});
