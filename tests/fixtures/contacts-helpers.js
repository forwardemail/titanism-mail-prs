import { expect } from '@playwright/test';

/**
 * Navigate to contacts and wait for it to load
 */
export async function navigateToContacts(page) {
  await page.goto('/contacts');
  await page.waitForSelector('.fe-contacts-list', { timeout: 10000 });
  await page.waitForTimeout(500);
}

/**
 * Open new contact modal
 */
export async function openNewContactModal(page) {
  await page.click('button[aria-label="New contact"]');
  const modal = page.locator('.fe-modal[role="dialog"]');
  await expect(modal).toBeVisible();
  return modal;
}

/**
 * Fill contact form with provided data
 */
export async function fillContactForm(page, contactData) {
  const { name, email, phone, notes, company, jobTitle, timezone, website, birthday } = contactData;

  if (name !== undefined) {
    await page.fill('input[placeholder*="Name"], input[name="name"]', name);
  }

  if (email !== undefined) {
    await page.fill('input[type="email"], input[placeholder*="Email"]', email);
  }

  if (phone !== undefined) {
    await page.fill('input[type="tel"], input[placeholder*="Phone"]', phone);
  }

  if (notes !== undefined) {
    await page.fill('textarea[placeholder*="Notes"], textarea[name="notes"]', notes);
  }

  // Handle optional fields
  if (company || jobTitle || timezone || website || birthday) {
    const optionalToggle = page.locator('button:has-text("Additional info")');
    if (await optionalToggle.isVisible()) {
      await optionalToggle.click();
      await page.waitForTimeout(300);
    }

    if (company !== undefined) {
      await page.fill('input[placeholder*="Company"], input[name="company"]', company);
    }

    if (jobTitle !== undefined) {
      await page.fill(
        'input[placeholder*="Job"], input[placeholder*="Title"], input[name="jobTitle"]',
        jobTitle,
      );
    }

    if (timezone !== undefined) {
      await page.fill(
        'input[placeholder*="Time"], input[placeholder*="zone"], input[name="timezone"]',
        timezone,
      );
    }

    if (website !== undefined) {
      await page.fill('input[type="url"], input[placeholder*="Website"]', website);
    }

    if (birthday !== undefined) {
      await page.fill('input[type="date"], input[name="birthday"]', birthday);
    }
  }
}

/**
 * Complete create contact flow
 */
export async function createContact(page, contactData) {
  await openNewContactModal(page);
  await fillContactForm(page, contactData);
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.fe-modal', { state: 'hidden', timeout: 5000 });
}

/**
 * Select a contact from the list by name
 */
export async function selectContact(page, contactName) {
  const contactRow = page.locator(`.fe-contact-row:has-text("${contactName}")`);
  await contactRow.click();
  await page.waitForTimeout(300);
}

/**
 * Open actions menu in detail panel
 */
export async function openActionsMenu(page) {
  const actionsBtn = page.locator('.fe-contact-actions button, button[aria-label*="Actions"]');
  await actionsBtn.click();
  await page.waitForTimeout(200);
}

/**
 * Enter edit mode and update contact inline
 */
export async function editContactInline(page, contactData) {
  await openActionsMenu(page);
  await page.click('button:has-text("Edit")');
  await page.waitForTimeout(300);
  await fillContactForm(page, contactData);
}

/**
 * Save inline edit
 */
export async function saveContactInline(page) {
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(500);
}

/**
 * Cancel inline edit
 */
export async function cancelEditInline(page) {
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(300);
}

/**
 * Delete contact with confirmation
 */
export async function deleteContact(page, contactName) {
  await selectContact(page, contactName);
  await openActionsMenu(page);
  await page.click('button:has-text("Delete")');
  const confirmModal = page.locator('.fe-modal[role="dialog"]');
  await expect(confirmModal).toBeVisible();
  await page.click('.fe-modal button:has-text("Delete")');
  await page.waitForTimeout(500);
}

/**
 * Search contacts
 */
export async function searchContacts(page, query) {
  await page.fill('.fe-contacts-search-input, input[type="search"]', query);
  await page.waitForTimeout(300);
}

/**
 * Import vCard file
 */
export async function importVCard(page, filePath) {
  await page.click('button[aria-label="Import vCard"]');
  await page.waitForTimeout(200);
  const fileInput = page.locator('input[type="file"][accept*="vcf"]');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(500);
}

/**
 * Export contact as vCard
 */
export async function exportContact(page, contactName) {
  await selectContact(page, contactName);
  await openActionsMenu(page);

  const downloadPromise = page.waitForEvent('download');
  await page.click('button:has-text("Export")');
  const download = await downloadPromise;

  return download;
}

/**
 * Upload contact photo
 */
export async function uploadContactPhoto(page, imagePath) {
  const fileInput = page.locator('input[id="contact-photo-upload"]');
  await fileInput.setInputFiles(imagePath);
  await page.waitForTimeout(500);
}

/**
 * Toggle optional fields section
 */
export async function toggleOptionalFields(page) {
  await page.click('button:has-text("Additional info")');
  await page.waitForTimeout(300);
}

/**
 * Verify contact appears in list
 */
export async function verifyContactInList(page, contactData) {
  const { name, email } = contactData;
  if (name) {
    await expect(page.locator(`.fe-contact-name:has-text("${name}")`)).toBeVisible();
  }
  if (email) {
    await expect(page.locator(`.fe-contact-email:has-text("${email}")`)).toBeVisible();
  }
}

/**
 * Verify contact not in list
 */
export async function verifyContactNotInList(page, contactName) {
  await expect(page.locator(`.fe-contact-name:has-text("${contactName}")`)).not.toBeVisible();
}

/**
 * Verify contact details in detail panel
 */
export async function verifyContactDetails(page, contactData) {
  const { name, email, phone, notes, company, jobTitle } = contactData;

  if (name) {
    await expect(page.locator('.fe-contacts-detail').getByText(name)).toBeVisible();
  }

  if (email) {
    await expect(page.locator('.fe-contacts-detail').getByText(email)).toBeVisible();
  }

  if (phone) {
    await expect(page.locator('.fe-contacts-detail').getByText(phone)).toBeVisible();
  }

  if (notes) {
    await expect(page.locator('.fe-contacts-detail').getByText(notes)).toBeVisible();
  }

  if (company || jobTitle) {
    const optionalToggle = page.locator('button:has-text("Additional info")');
    if (await optionalToggle.isVisible()) {
      await optionalToggle.click();
      await page.waitForTimeout(300);
    }

    if (company) {
      await expect(page.locator('.fe-contacts-detail').getByText(company)).toBeVisible();
    }

    if (jobTitle) {
      await expect(page.locator('.fe-contacts-detail').getByText(jobTitle)).toBeVisible();
    }
  }
}

/**
 * Click Email action
 */
export async function clickEmailAction(page) {
  await openActionsMenu(page);
  await page.click('button:has-text("Email")');
  await page.waitForTimeout(300);
}

/**
 * Click Add Event action
 */
export async function clickAddEventAction(page) {
  await openActionsMenu(page);
  await page.click('button:has-text("Add event")');
  await page.waitForTimeout(300);
}

/**
 * Click View Emails action
 */
export async function clickViewEmailsAction(page) {
  await openActionsMenu(page);
  await page.click('button:has-text("View emails")');
  await page.waitForTimeout(300);
}

/**
 * Wait for success toast
 */
export async function waitForSuccessToast(page, expectedText) {
  const toast = page.locator('.fe-toast:has-text("' + (expectedText || '') + '")');
  await expect(toast).toBeVisible({ timeout: 5000 });
}

/**
 * Wait for error toast
 */
export async function waitForErrorToast(page, expectedText) {
  const errorToast = page.locator(
    '.fe-toast.error:has-text("' + (expectedText || '') + '"), .fe-alert.error',
  );
  await expect(errorToast).toBeVisible({ timeout: 5000 });
}

/**
 * Get expected initials from contact
 */
export function getContactInitials(contact) {
  const name = contact.name || contact.full_name || '';
  const email = contact.email || (contact.emails && contact.emails[0]?.value) || '';

  if (name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  if (email) {
    const localPart = email.split('@')[0];
    return localPart.substring(0, 2).toUpperCase();
  }

  return '??';
}
