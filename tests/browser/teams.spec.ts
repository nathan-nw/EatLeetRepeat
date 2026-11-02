import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, member: number, destination = '/teams') {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email address').fill(`member${member}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(destination);
}

test('private team lifecycle, shared history, filters, paging, and mobile navigation', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const outsiderContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const outsider = await outsiderContext.newPage();
  const errors: string[] = [];
  [owner, member, outsider].forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
  await login(owner, 1);
  await owner.getByLabel('Team name').fill('Interview study group');
  await owner.getByRole('button', { name: 'Create team', exact: true }).click();
  const inviteUrl = await owner.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue();
  const invitePath = new URL(inviteUrl).pathname;
  await owner.getByRole('link', { name: 'Open your team' }).click();
  await expect(owner).toHaveURL(/\/teams\/[0-9a-f-]{36}$/);
  await expect(owner.getByRole('heading', { name: 'Interview study group', exact: true })).toBeVisible();
  const teamUrl = owner.url();

  await login(outsider, 23);
  await outsider.goto(teamUrl);
  await expect(outsider.getByRole('heading', { name: 'Team unavailable' })).toBeVisible();
  await member.goto(invitePath);
  await expect(member).toHaveURL(/\/login\?next=/);
  await member.getByLabel('Email address').fill('member2@example.test');
  await member.getByLabel('Password', { exact: true }).fill('local-test-password');
  await member.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(member.getByRole('heading', { name: 'Join Interview study group' })).toBeVisible();
  await member.getByRole('button', { name: 'Join team and share history' }).click();
  await expect(member.getByRole('heading', { name: 'Interview study group', exact: true })).toBeVisible();
  await member.getByLabel('Year', { exact: true }).selectOption('2024');
  await expect(member.getByText('30 submissions', { exact: true })).toBeVisible();
  const feed = member.getByRole('region', { name: 'Team activity', exact: true });
  await expect(feed.getByRole('listitem')).toHaveCount(25);
  await member.getByRole('button', { name: 'Load more' }).click();
  await expect(feed.getByRole('listitem')).toHaveCount(30);
  await member.getByRole('button', { name: 'member02: 30 submissions on 2024-02-29, UTC. Show activity.' }).click();
  await expect(member).toHaveURL(/day=2024-02-29/);
  await expect(member.getByRole('button', { name: /member02 · 2024-02-29 UTC · Clear/ })).toBeVisible();
  await member.getByLabel('Difficulty', { exact: true }).selectOption('Hard');
  await expect(member).not.toHaveURL(/day=/);
  await expect(member.getByText('No recorded solves match these filters.', { exact: false })).toBeVisible();
  await member.getByRole('button', { name: 'Clear filters' }).click();
  await expect(member.getByText('30 submissions', { exact: true })).toBeVisible();
  await member.setViewportSize({ width: 390, height: 844 });
  await expect(member.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Teams', exact: true })).toBeVisible();
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await member.screenshot({ path: 'test-results/team-mobile.png', fullPage: true });

  await owner.getByRole('button', { name: 'Refresh', exact: true }).click();
  await owner.getByText('Manage team and invitations', { exact: true }).click();
  await owner.getByLabel('Member', { exact: true }).selectOption({ label: 'member02' });
  owner.on('dialog', (dialog) => dialog.accept());
  await owner.getByRole('button', { name: 'Remove and reset invite', exact: true }).click();
  await expect(owner.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible();
  await member.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(member.getByRole('main').getByRole('alert')).toContainText('Team unavailable');
  await member.goto(invitePath);
  await expect(member.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible();
  await owner.getByRole('button', { name: 'Delete team', exact: true }).click();
  await expect(owner).toHaveURL('/teams');
  expect(errors).toEqual([]);
  await Promise.all([ownerContext.close(), memberContext.close(), outsiderContext.close()]);
});

test('signup confirmation and handle onboarding preserve the pending invitation', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const newcomerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const newcomer = await newcomerContext.newPage();
  await login(owner, 1);
  await owner.getByLabel('Team name').fill('Newcomer group');
  await owner.getByRole('button', { name: 'Create team', exact: true }).click();
  const invite = new URL(await owner.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue()).pathname;
  await newcomer.goto(invite);
  await newcomer.getByRole('button', { name: 'Create one', exact: true }).click();
  await newcomer.getByLabel('Email address').fill('member22@example.test');
  await newcomer.getByLabel('Password', { exact: true }).fill('test-new-password');
  const signupRequest = newcomer.waitForRequest((request) => request.url().includes('/auth/v1/signup'));
  await newcomer.getByRole('button', { name: 'Create account', exact: true }).click();
  const signupUrl = new URL((await signupRequest).url());
  const confirmation = new URL(signupUrl.searchParams.get('redirect_to')!);
  expect(confirmation.searchParams.get('next')).toBe(invite);
  await expect(newcomer.getByText('Check your email', { exact: true })).toBeVisible();
  // Simulate the Supabase email template's confirmation link; delivery itself
  // is an external-service smoke test, not part of this local adapter.
  await newcomer.goto(`/auth/confirm?token_hash=fixture-member22&type=signup&next=${encodeURIComponent(invite)}`);
  await expect(newcomer.getByRole('heading', { name: 'Connect your LeetCode' })).toBeVisible();
  await expect(newcomer.locator('input[name="next"]')).toHaveValue(invite);
  await newcomer.getByLabel('LeetCode username').fill('new-member22');
  await newcomer.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(newcomer.getByRole('heading', { name: 'Join Newcomer group' })).toBeVisible();
  await newcomer.getByRole('button', { name: 'Join team and share history' }).click();
  await expect(newcomer).toHaveURL(/\/teams\/[0-9a-f-]{36}$/);
  await expect(newcomer.getByRole('heading', { name: 'new-member22', exact: true })).toBeVisible();
  await Promise.all([ownerContext.close(), newcomerContext.close()]);
});
