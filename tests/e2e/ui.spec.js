import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('account menu opens from avatar', async ({ page }) => {
  const menu = page.locator('#accountMenu');
  const dropdown = page.locator('#accountDropdown');

  await page.locator('#authBtn').click();
  await expect(menu).toHaveClass(/open/);
  await expect(dropdown).toBeVisible();

  // Theme switch within account menu
  await page.locator('#themeSelect').selectOption('dracula');
  await expect(page.locator('body')).toHaveClass(/theme-dracula/);
});

test('capacity modal shows default reserve selections', async ({ page }) => {
  await page.locator('#capacityBtn').click();
  const modal = page.locator('#capacityModal');
  await expect(modal).toBeVisible();

  await expect(page.locator('#adhocReserve')).toHaveValue('20');
  await expect(page.locator('#bugReserve')).toHaveValue('10');

  // Changing reserve should update the displayed reserves row
  const reserveBefore = await page.locator('#reserveTotal').textContent();
  await page.locator('#adhocReserve').selectOption('40');
  await expect(page.locator('#reserveTotal')).not.toHaveText(reserveBefore ?? '');
});

test('capacity apply updates summary', async ({ page }) => {
  const availableBefore = await page.locator('#capacityAvailable').textContent();
  await page.locator('#capacityBtn').click();
  await page.locator('#adhocReserve').selectOption('40');
  await page.locator('#bugReserve').selectOption('15');
  await page.locator('#applyCapacityBtn').click();
  await expect(page.locator('#capacityAvailable')).not.toHaveText(availableBefore ?? '');
});

test('can add a project via modal', async ({ page }) => {
  await page.locator('#addProjectBtn').click();
  const modal = page.locator('#projectModal');
  await expect(modal).toBeVisible();

  const nameInput = page.locator('#projectName');
  await nameInput.fill('Playwright E2E Project');
  await page.locator('#projectManDayEstimate').fill('5');
  await page.locator('#saveProjectBtn').click();

  await expect(modal).not.toBeVisible();
  await expect(page.locator('body')).toContainText('Playwright E2E Project');
});

test('spreadsheet modal opens and closes', async ({ page }) => {
  await page.locator('#spreadsheetBtn').click();
  const modal = page.locator('#spreadsheetModal');
  await expect(modal).toBeVisible();
  await page.locator('#closeSpreadsheetModal').click();
  await expect(modal).not.toBeVisible();
});

test('account menu shows data actions', async ({ page }) => {
  await page.locator('#authBtn').click();
  await expect(page.locator('#accountExportBtn')).toBeVisible();
  await expect(page.locator('#accountImportBtn')).toBeVisible();
  await expect(page.locator('#accountShareBtn')).toBeVisible();

  await page.locator('#accountExportBtn').click();
  const exportModal = page.locator('#exportModal');
  await expect(exportModal).toBeVisible();
  await page.locator('#closeExportModal').click();

  // Reopen menu for import (export closes it)
  await page.locator('#authBtn').click();
  await page.locator('#accountImportBtn').click();
  const importModal = page.locator('#importModal');
  await expect(importModal).toBeVisible();
  await page.locator('#closeImportModal').click();
});
