import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { MobileAccountPage } from './page-models/mobile-account-page';
import { MobileNavigation } from './page-models/mobile-navigation';
import { Navigation } from './page-models/navigation';

test.describe('Mobile Accounts', () => {
  let page: Page;
  let navigation: MobileNavigation;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new MobileNavigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.setViewportSize({
      width: 350,
      height: 600,
    });
    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('opens the accounts page and asserts on balances', async () => {
    const accountsPage = await navigation.goToAccountsPage();
    await accountsPage.waitFor();

    const account = await accountsPage.getNthAccount(1);

    await expect(account.name).toHaveText('Ally Savings');
    await expect(account.balance).toHaveText('7,653.00');
    await expect(page).toMatchThemeScreenshots();
  });

  test('opens individual account page and checks that filtering is working', async () => {
    const accountsPage = await navigation.goToAccountsPage();
    await accountsPage.waitFor();

    const accountPage = await accountsPage.openNthAccount(0);
    await accountPage.waitFor();

    await expect(accountPage.heading).toHaveText('Bank of America');
    await expect(accountPage.transactionList).toBeVisible();
    expect(await accountPage.getBalance()).toBeGreaterThan(0);
    await expect(accountPage.noTransactionsMessage).not.toBeVisible();
    await expect(page).toMatchThemeScreenshots();

    await accountPage.searchByText('nothing should be found');
    await expect(accountPage.noTransactionsMessage).toBeVisible();
    await expect(accountPage.transactions).toHaveCount(0);
    await expect(page).toMatchThemeScreenshots();

    await accountPage.clearSearch();
    await expect(accountPage.transactions).not.toHaveCount(0);

    await accountPage.searchByText('Kroger');
    await expect(accountPage.transactions).not.toHaveCount(0);
    await expect(page).toMatchThemeScreenshots();
  });

  test('searching a payee lists a split with its matching lines', async () => {
    // Splitting on desktop clears the parent's payee, leaving it on the lines.
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopAccountPage = await new Navigation(page).goToAccountPage(
      'Ally Savings',
    );
    await desktopAccountPage.createSplitTransaction([
      { payee: 'Krogger', debit: '333.33' },
      { category: 'General', debit: '222.22' },
      { category: 'Food', debit: '111.11' },
    ]);

    await page.setViewportSize({ width: 350, height: 600 });
    const accountPage = new MobileAccountPage(page);
    await accountPage.waitFor();

    await accountPage.searchByText('Krogger');
    await expect(accountPage.transactions).toHaveCount(3);
    await expect(accountPage.transactions.first()).toContainText('333.33');
  });

  test('reconciles an account', async () => {
    const accountsPage = await navigation.goToAccountsPage();
    await accountsPage.waitFor();

    const accountPage = await accountsPage.openNthAccount(0);
    await accountPage.waitFor();

    await accountPage.startReconciliation('200.00');
    await expect(accountPage.reconcilingBannerDifference).toBeVisible();
    await expect(page).toMatchThemeScreenshots();

    await accountPage.createReconciliationTransaction();
    await expect(accountPage.reconcilingBannerAllReconciled).toBeVisible();
    await expect(page).toMatchThemeScreenshots();

    await accountPage.unclearFirstTransaction();
    await expect(accountPage.reconcilingBannerDifference).toBeVisible();

    await accountPage.clearFirstTransaction();
    await expect(accountPage.reconcilingBannerAllReconciled).toBeVisible();

    await accountPage.lockTransactions();
    await expect(accountPage.reconcilingBanner).not.toBeVisible();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(accountsPage.accountList).toBeVisible();
  });
});
