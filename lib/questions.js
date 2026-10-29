// Question bank. Everything except publicQuestion() output stays server-side.
// Playwright questions are graded two ways: (1) static guards on the comment-stripped code
// (anti-patterns / required APIs), and (2) a REAL Playwright run against the sample app.
const any = (...res) => (c) => res.some((r) => (r instanceof RegExp ? r.test(c) : c.includes(r)));
const all = (...res) => (c) => res.every((r) => (r instanceof RegExp ? r.test(c) : c.includes(r)));
const none = (...res) => (c) => !res.some((r) => (r instanceof RegExp ? r.test(c) : c.includes(r)));

const BASE_NOTE = 'Tests run against the sample app with baseURL preconfigured: use relative paths such as page.goto("/").';

const QUESTIONS = [
  // ------------------------------------------------------------------ DOTCOM
  {
    id: 'DC-1', track: 'dotcom', kind: 'playwright', title: 'Resilient locators and strict mode',
    difficulty: 'Easy', topic: 'Locators and strict mode', appPath: '/',
    hint: 'Inspect the product grid: button IDs change on every render, and all four cards share the same "Add to Cart" text.',
    scenario: 'The test below was written against an old build. #btn-paw-84920 no longer exists (IDs are regenerated on every render) and getByText("Add to Cart") matches four buttons, so Playwright throws a strict mode violation. Fix it so the "50W Preset Aquarium Heater" is added to the cart.',
    requirements: [
      'Remove the brittle dynamic ID and the ambiguous getByText locator.',
      'Scope to [data-testid="product-card"] and narrow it with .filter({ hasText }) to the heater card. Do not use .first(), .nth() or XPath.',
      'Click the card\'s "Add to Cart" button using getByRole("button").',
      'Assert [data-testid="dotcom-cart-badge"] has text "1".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-1: add the 50W Preset Aquarium Heater', async ({ page }) => {
  await page.goto('/');

  // BROKEN: dynamic id + text that matches 4 buttons
  await page.locator('#btn-paw-84920').click();
  await page.getByText('Add to Cart').click();

  // TODO: scope to the heater card, click its button, assert the cart badge shows 1
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-1: add the 50W Preset Aquarium Heater', async ({ page }) => {
  await page.goto('/');

  const heaterCard = page
    .locator('[data-testid="product-card"]')
    .filter({ hasText: '50W Preset Aquarium Heater' });

  await heaterCard.getByRole('button', { name: /add to cart/i }).click();

  await expect(page.getByTestId('dotcom-cart-badge')).toHaveText('1');
});`,
    notes: 'Look for .filter({ hasText }) or getByRole chaining. Red flags: .first(), .nth(0), XPath indexes, CSS ids. Follow-up: when would you add a data-testid to the product instead?',
    guards: [
      { name: 'Removed the dynamic id (#btn-paw-...)', hint: 'Delete the page.locator("#btn-paw-84920") line.', test: none('#btn-paw') },
      { name: 'No positional locators (.first(), .nth(), XPath)', hint: 'Select the card by what it contains, not by position.', test: none(/\.first\(\)/, /\.nth\(/, /\.last\(\)/, /xpath=|\/\/\w+\[/) },
      { name: 'Scoped to product-card and filtered by the product name', hint: 'locator(\'[data-testid="product-card"]\').filter({ hasText: "50W Preset Aquarium Heater" })', test: all('product-card', '.filter(', '50W Preset Aquarium Heater') },
      { name: 'Clicked the button with getByRole', hint: 'card.getByRole("button", { name: /add to cart/i })', test: all('getByRole') },
      { name: 'Asserted the cart badge', hint: 'expect(page.getByTestId("dotcom-cart-badge")).toHaveText("1")', test: all('dotcom-cart-badge', /toHaveText|toContainText/) }
    ]
  },
  {
    id: 'DC-2', track: 'dotcom', kind: 'playwright', title: 'Dropdown and file upload',
    difficulty: 'Easy-Medium', topic: 'selectOption and setInputFiles', appPath: '/checkout',
    hint: 'See "Vet prescription approval": a native <select> and a file input. A fixture file exists at fixtures/vet-prescription.pdf.',
    scenario: 'To buy Rx medication, pet parents pick a species from a native <select> and upload a signed prescription PDF. Automate both steps and verify the confirmation.',
    requirements: [
      'Select "canine-rx" on [data-testid="dotcom-pet-select"] using .selectOption().',
      'Upload fixtures/vet-prescription.pdf to [data-testid="dotcom-rx-upload"] using .setInputFiles().',
      'Assert [data-testid="dotcom-upload-status"] contains "vet-prescription.pdf" and "canine-rx".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-2: choose species and upload the vet prescription', async ({ page }) => {
  await page.goto('/checkout');

  // Anti-pattern: clicking <option> elements of a native <select> does not work.
  // await page.locator('option[value="canine-rx"]').click();

  // TODO 1: select 'canine-rx'
  // TODO 2: upload 'fixtures/vet-prescription.pdf'
  // TODO 3: assert the upload status text
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-2: choose species and upload the vet prescription', async ({ page }) => {
  await page.goto('/checkout');

  await page.getByTestId('dotcom-pet-select').selectOption('canine-rx');
  await page.getByTestId('dotcom-rx-upload').setInputFiles('fixtures/vet-prescription.pdf');

  const status = page.getByTestId('dotcom-upload-status');
  await expect(status).toContainText('vet-prescription.pdf');
  await expect(status).toContainText('canine-rx');
});`,
    notes: 'Follow-up: upload several files / clear a file input (setInputFiles([...]) / setInputFiles([])). Order matters: selecting the species first is reflected in the status text.',
    guards: [
      { name: 'Used selectOption on dotcom-pet-select', hint: 'getByTestId("dotcom-pet-select").selectOption("canine-rx")', test: all('dotcom-pet-select', '.selectOption(', 'canine-rx') },
      { name: 'Used setInputFiles with the PDF fixture', hint: 'getByTestId("dotcom-rx-upload").setInputFiles("fixtures/vet-prescription.pdf")', test: all('dotcom-rx-upload', '.setInputFiles(', 'vet-prescription.pdf') },
      { name: 'Asserted the upload status', hint: 'expect(page.getByTestId("dotcom-upload-status")).toContainText(...)', test: all('dotcom-upload-status', /toContainText|toHaveText/) },
      { name: 'Did not click <option> elements directly', hint: 'Use selectOption on the <select>.', test: none(/locator\(['"`]option/) }
    ]
  },
  {
    id: 'DC-3', track: 'dotcom', kind: 'playwright', title: 'Cross-origin payment iframe',
    difficulty: 'Medium', topic: 'frameLocator', appPath: '/checkout',
    hint: 'The payment form is a real iframe (#pci-card-iframe) served from another origin/port. Inspect it in DevTools.',
    scenario: 'Card details are entered inside a cross-origin iframe. page.getByTestId() cannot see into it, so the test below times out. Complete the payment verification inside the frame.',
    requirements: [
      'Scope to the frame with page.frameLocator("#pci-card-iframe").',
      'Fill pci-card-input with 4111222233334444 and pci-expiry-input with 12/28.',
      'Click pci-verify-btn and assert pci-token-badge is visible and contains "TOK_PETCARE_".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-3: verify card inside the PCI iframe', async ({ page }) => {
  await page.goto('/checkout');

  // FAILS: these elements live inside <iframe id="pci-card-iframe">
  await page.getByTestId('pci-card-input').fill('4111222233334444');

  // TODO: use page.frameLocator, fill both fields, click verify, assert the token badge
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-3: verify card inside the PCI iframe', async ({ page }) => {
  await page.goto('/checkout');

  const pciFrame = page.frameLocator('#pci-card-iframe');
  await pciFrame.getByTestId('pci-card-input').fill('4111222233334444');
  await pciFrame.getByTestId('pci-expiry-input').fill('12/28');
  await pciFrame.getByTestId('pci-verify-btn').click();

  const badge = pciFrame.getByTestId('pci-token-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('TOK_PETCARE_');
});`,
    notes: 'Ask: frameLocator() vs page.frame()? (frameLocator is lazy and survives iframe reloads.) Also: how would you handle nested iframes?',
    guards: [
      { name: 'Scoped with page.frameLocator("#pci-card-iframe")', hint: 'const pciFrame = page.frameLocator("#pci-card-iframe")', test: all('frameLocator', '#pci-card-iframe') },
      { name: 'Filled card number and expiry', hint: 'Use the frame locator for both inputs.', test: all('pci-card-input', 'pci-expiry-input', '4111222233334444', '12/28') },
      { name: 'Clicked verify and asserted the token badge is visible', hint: 'expect(pciFrame.getByTestId("pci-token-badge")).toBeVisible()', test: all('pci-verify-btn', 'pci-token-badge', 'toBeVisible') }
    ]
  },
  {
    id: 'DC-4', track: 'dotcom', kind: 'playwright', title: 'Custom test fixture',
    difficulty: 'Medium-Hard', topic: 'base.extend fixtures', appPath: '/checkout',
    hint: 'The checkout page reads localStorage "pet_profile" and shows it in [data-testid="pet-profile-badge"]. It must be set BEFORE the page loads.',
    scenario: 'Every Auto-Ship checkout test needs a pre-seeded pet profile and cleanup afterwards. Instead of copying beforeEach/afterEach into 35 spec files, build a petParentPage fixture with base.extend().',
    requirements: [
      'In the petParentPage fixture, seed localStorage pet_profile = "GOLDEN_RETRIEVER" before navigation (hint: page.addInitScript), then goto "/checkout".',
      'Hand the page to the test with await use(page) and clear storage after it (teardown).',
      'Inject { petParentPage } into the test; assert pet-profile-badge has text GOLDEN_RETRIEVER and dotcom-place-order-btn is visible.'
    ],
    starterCode: `import { test as base, expect, type Page } from '@playwright/test';

type PawMartFixtures = {
  petParentPage: Page;
};

export const test = base.extend<PawMartFixtures>({
  petParentPage: async ({ page }, use) => {
    // 1. Seed localStorage pet_profile = 'GOLDEN_RETRIEVER' before the page loads
    // 2. goto('/checkout')
    // 3. await use(page)
    // 4. Teardown: clear storage
  }
});

// TODO: use the petParentPage fixture and assert the badge + order button
test('DC-4: checkout with a seeded pet profile', async ({ page }) => {

});`,
    solutionCode: `import { test as base, expect, type Page } from '@playwright/test';

type PawMartFixtures = {
  petParentPage: Page;
};

export const test = base.extend<PawMartFixtures>({
  petParentPage: async ({ page }, use) => {
    await page.addInitScript(() => window.localStorage.setItem('pet_profile', 'GOLDEN_RETRIEVER'));
    await page.goto('/checkout');

    await use(page);

    await page.evaluate(() => window.localStorage.clear());
  }
});

test('DC-4: checkout with a seeded pet profile', async ({ petParentPage }) => {
  await expect(petParentPage.getByTestId('pet-profile-badge')).toHaveText('GOLDEN_RETRIEVER');
  await expect(petParentPage.getByTestId('dotcom-place-order-btn')).toBeVisible();
});`,
    notes: 'Ask what runs after await use() (teardown, even if the test fails). Follow-ups: fixture scope (test vs worker), auto: true fixtures, combining fixtures with Page Objects.',
    guards: [
      { name: 'Defines petParentPage with base.extend and a use callback', hint: 'base.extend<PawMartFixtures>({ petParentPage: async ({ page }, use) => { ... } })', test: all('base.extend', 'petParentPage:', /\buse\b/) },
      { name: 'Seeds pet_profile and navigates to /checkout', hint: 'page.addInitScript(...) then page.goto("/checkout")', test: all('pet_profile', 'GOLDEN_RETRIEVER', '/checkout') },
      { name: 'Calls await use(page)', hint: 'Yield the prepared page to the test.', test: any('await use(page)', /await use\(/) },
      { name: 'Test receives { petParentPage }', hint: 'async ({ petParentPage }) => { ... }', test: (c) => /test\([^]*?async\s*\(\s*\{\s*petParentPage\s*\}\s*\)/.test(c) },
      { name: 'Asserts the pet-profile badge and the order button', hint: 'Check pet-profile-badge text and dotcom-place-order-btn visibility.', test: all('pet-profile-badge', 'dotcom-place-order-btn', 'toBeVisible') }
    ]
  },
  {
    id: 'DC-5', track: 'dotcom', kind: 'playwright', title: 'Flaky search (race condition)',
    difficulty: 'Medium', topic: 'Synchronization', appPath: '/',
    hint: 'Type "Kibble" in the search box and watch the grid: it keeps showing all four products for a moment before filtering.',
    scenario: 'Search is debounced and answered by a slow API. The grid shows stale results until the response lands, so clicking the first card right after typing adds the wrong product. Make the test deterministic without sleeping.',
    requirements: [
      'Fill dotcom-search-input with "Kibble".',
      'Synchronize on observable state (e.g. expect(cards).toHaveCount(1) or waitForResponse). No waitForTimeout.',
      'Add the remaining product to the cart and assert [data-testid="cart-item"] contains "Royal Canin Adult Dog Kibble".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-5: search for kibble and add it to the cart', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('dotcom-search-input').fill('Kibble');

  // RACE: the grid still shows all 4 products while the search is in flight
  await page.locator('[data-testid="product-card"]').first().getByRole('button').click();

  await expect(page.getByTestId('cart-item')).toContainText('Royal Canin Adult Dog Kibble');
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-5: search for kibble and add it to the cart', async ({ page }) => {
  await page.goto('/');

  const cards = page.locator('[data-testid="product-card"]');
  await page.getByTestId('dotcom-search-input').fill('Kibble');

  await expect(cards).toHaveCount(1);
  await cards.getByRole('button', { name: /add to cart/i }).click();

  await expect(page.getByTestId('cart-item')).toContainText('Royal Canin Adult Dog Kibble');
});`,
    notes: 'Strong answers wait on DOM state or the network response, never on time. Ask: waitForResponse vs web-first assertion trade-offs; why is .first() the root cause here?',
    guards: [
      { name: 'No hard sleeps (waitForTimeout)', hint: 'Remove waitForTimeout; wait for state instead.', test: none('waitForTimeout') },
      { name: 'Searches for "Kibble"', hint: 'Keep the fill("Kibble") step.', test: all('dotcom-search-input', 'Kibble') },
      { name: 'Asserts the cart item', hint: 'expect(page.getByTestId("cart-item")).toContainText("Royal Canin Adult Dog Kibble")', test: all('cart-item', 'Royal Canin Adult Dog Kibble') }
    ]
  },
  {
    id: 'DC-6', track: 'dotcom', kind: 'playwright', title: 'API login and shared session',
    difficulty: 'Medium', topic: 'APIRequestContext, storageState', appPath: '/account',
    hint: 'POST /api/v1/auth/login (pet_parent / secret) sets an HttpOnly cookie. /account shows a welcome message only when that cookie is present.',
    scenario: 'Logging in through the UI costs 8 seconds per spec. Authenticate with the API instead and make sure the browser page is actually logged in. The test below logs nothing in, so /account says "Please log in".',
    requirements: [
      'POST to "/api/v1/auth/login" with { username: "pet_parent", password: "secret" } and assert the response is OK.',
      'Make the page share that session (hint: page.request shares cookies with page; the standalone request fixture does not).',
      'Open "/account" and assert [data-testid="account-welcome"] contains "pet_parent".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-6: log in through the API and open the account page', async ({ page, request }) => {
  // TODO: authenticate via the API and share the session with \`page\`

  await page.goto('/account');
  await expect(page.getByTestId('account-welcome')).toContainText('pet_parent');
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-6: log in through the API and open the account page', async ({ page }) => {
  const response = await page.request.post('/api/v1/auth/login', {
    data: { username: 'pet_parent', password: 'secret' }
  });
  expect(response.ok()).toBeTruthy();

  await page.goto('/account');
  await expect(page.getByTestId('account-welcome')).toContainText('pet_parent');
});`,
    notes: 'Key insight: the request fixture has its own cookie jar. Accept page.request, context.request, or request.storageState() fed into a new context. Follow-up: setup project + storageState file reuse across workers.',
    guards: [
      { name: 'Calls POST /api/v1/auth/login', hint: 'await page.request.post("/api/v1/auth/login", { data: {...} })', test: all('/api/v1/auth/login', '.post(') },
      { name: 'Asserts the login response status', hint: 'expect(response.ok()).toBeTruthy()', test: any('.ok()', '.status()') },
      { name: 'Asserts the welcome message', hint: 'expect(page.getByTestId("account-welcome")).toContainText("pet_parent")', test: all('account-welcome', 'pet_parent') }
    ]
  },
  {
    id: 'DC-7', track: 'dotcom', kind: 'playwright', title: 'Catch silent crashes (pageerror and 5xx)',
    difficulty: 'Hard', topic: 'Error listeners, debugging', appPath: '/checkout',
    hint: 'Type "742 Bark Ave Gate #4B" in the address field and place the order. Open DevTools: nothing shows on screen, but the console and network tabs do.',
    scenario: 'When the delivery address contains "#" or "&" the checkout API returns HTTP 500 and the page throws an uncaught error. The UI shows nothing, so a plain click-and-assert test never notices. Write a test that records both signals and proves the bug is reproducible.',
    requirements: [
      'Attach page.on("pageerror") to push uncaught JS error messages into serverErrors.',
      'Attach page.on("response") to push an entry like "500 <url>" for every response with status >= 500.',
      'Fill "742 Bark Ave Gate #4B", click Place Pet Order, wait until something was captured (expect.poll or similar, no sleeps) and assert serverErrors mentions "/api/v1/checkout/submit".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('DC-7: capture silent checkout crashes', async ({ page }) => {
  const serverErrors: string[] = [];

  // TODO 1: page.on('pageerror', ...) and page.on('response', ...) (status >= 500)

  await page.goto('/checkout');
  await page.getByTestId('dotcom-address-input').fill('742 Bark Ave Gate #4B');
  await page.getByTestId('dotcom-place-order-btn').click();

  // TODO 2: wait for the listeners to fire, then assert serverErrors contains the submit endpoint
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('DC-7: capture silent checkout crashes', async ({ page }) => {
  const serverErrors: string[] = [];

  page.on('pageerror', (err) => {
    serverErrors.push('pageerror: ' + err.message);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(response.status() + ' ' + response.url());
    }
  });

  await page.goto('/checkout');
  await page.getByTestId('dotcom-address-input').fill('742 Bark Ave Gate #4B');
  await page.getByTestId('dotcom-place-order-btn').click();

  await expect.poll(() => serverErrors.length).toBeGreaterThan(0);
  expect(serverErrors.join('\\n')).toContain('/api/v1/checkout/submit');
});`,
    notes: 'Senior signal: using listeners as guardrails (could also be an auto fixture that fails every test on pageerror). Ask how to turn this into a reusable fixture, and how to assert the bug is fixed later.',
    guards: [
      { name: 'Attached a pageerror listener', hint: 'page.on("pageerror", (err) => ...)', test: any("page.on('pageerror'", 'page.on("pageerror"') },
      { name: 'Attached a response listener checking for 500+', hint: 'page.on("response", (r) => { if (r.status() >= 500) ... })', test: (c) => /page\.on\(['"]response['"]/.test(c) && /500/.test(c) },
      { name: 'No hard sleeps', hint: 'Use expect.poll / expect(...) instead of waitForTimeout.', test: none('waitForTimeout') },
      { name: 'Asserts on the captured errors', hint: 'expect(serverErrors.join(...)).toContain("/api/v1/checkout/submit")', test: all('expect(', 'serverErrors', '/api/v1/checkout/submit') }
    ]
  },

  // --------------------------------------------------------------------- POS
  {
    id: 'POS-1', track: 'pos', kind: 'playwright', title: 'Slow promo: no hard sleeps',
    difficulty: 'Easy', topic: 'Auto-waiting, web-first assertions', appPath: '/pos',
    hint: 'Apply promo "PAW10": validation takes about 3 seconds before the banner text appears.',
    scenario: 'The test uses page.waitForTimeout(2000) and a non-retrying innerText() snapshot. The backend takes 3 seconds, so CI fails constantly. Replace both with an auto-retrying assertion.',
    requirements: [
      'Remove page.waitForTimeout() and the .innerText() snapshot.',
      'Use a web-first assertion (toContainText or toHaveText) on [data-testid="pos-promo-status"] expecting "PROMO APPLIED".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('POS-1: apply the PAW10 clinic promo', async ({ page }) => {
  await page.goto('/pos');

  await page.getByTestId('pos-promo-input').fill('PAW10');
  await page.getByTestId('pos-apply-promo-btn').click();

  // FLAKY: the sleep is shorter than the validation and innerText() does not retry
  await page.waitForTimeout(2000);
  const status = await page.getByTestId('pos-promo-status').innerText();
  expect(status).toContain('PROMO APPLIED');
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('POS-1: apply the PAW10 clinic promo', async ({ page }) => {
  await page.goto('/pos');

  await page.getByTestId('pos-promo-input').fill('PAW10');
  await page.getByTestId('pos-apply-promo-btn').click();

  await expect(page.getByTestId('pos-promo-status')).toContainText('PROMO APPLIED');
});`,
    notes: 'Basics check: web-first assertions retry until the timeout (5s default here). A candidate who raises the sleep to 5000 has not understood the point.',
    guards: [
      { name: 'Removed waitForTimeout', hint: 'Delete the hard sleep.', test: none('waitForTimeout') },
      { name: 'Removed the non-retrying innerText() snapshot', hint: 'Pass the locator itself to expect().', test: none('.innerText()', '.textContent()') },
      { name: 'Used a web-first assertion on pos-promo-status', hint: 'await expect(locator).toContainText("PROMO APPLIED")', test: all('pos-promo-status', /\.\s*(toContainText|toHaveText)\(/) }
    ]
  },
  {
    id: 'POS-2', track: 'pos', kind: 'playwright', title: 'Row-scoped table locators',
    difficulty: 'Easy-Medium', topic: 'Chained table locators', appPath: '/pos',
    hint: 'Watch the inventory table: rows reshuffle every few seconds, so row positions are not stable.',
    scenario: 'The inventory table is live and re-sorts itself. Positional XPath like //tr[2]/td[4]/button clicks a random product. Add "Royal Canin Adult Dog Kibble" to the POS cart reliably.',
    requirements: [
      'Remove the positional XPath.',
      'Locate [data-testid="pos-inventory-row"] filtered by hasText "Royal Canin Adult Dog Kibble".',
      'Assert the row contains "15 bags", click "+ POS Cart" inside that row, then assert pos-cart-count is "1" and pos-cart-lines contains the product name.'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('POS-2: add Dog Kibble from the live inventory table', async ({ page }) => {
  await page.goto('/pos');

  // BRITTLE: row order changes
  await page.locator('//table/tbody/tr[2]/td[4]/button').click();

  await expect(page.getByTestId('pos-cart-lines')).toContainText('Royal Canin Adult Dog Kibble');
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('POS-2: add Dog Kibble from the live inventory table', async ({ page }) => {
  await page.goto('/pos');

  const kibbleRow = page
    .getByTestId('pos-inventory-row')
    .filter({ hasText: 'Royal Canin Adult Dog Kibble' });

  await expect(kibbleRow).toContainText('15 bags');
  await kibbleRow.getByRole('button', { name: '+ POS Cart' }).click();

  await expect(page.getByTestId('pos-cart-count')).toHaveText('1');
  await expect(page.getByTestId('pos-cart-lines')).toContainText('Royal Canin Adult Dog Kibble');
});`,
    notes: 'Row entity scoping. Follow-up: how to read all rows into a typed array (locator.evaluateAll / allInnerTexts) and when toHaveText with arrays is better.',
    guards: [
      { name: 'Removed positional XPath', hint: 'Delete the //table/tbody/tr[2] locator.', test: none('//table', '//tr', 'xpath=') },
      { name: 'Filtered pos-inventory-row by product name', hint: 'getByTestId("pos-inventory-row").filter({ hasText: "Royal Canin Adult Dog Kibble" })', test: all('pos-inventory-row', '.filter(', 'Royal Canin Adult Dog Kibble') },
      { name: 'Verified stock text and clicked inside the row', hint: 'expect(row).toContainText("15 bags"), then row.getByRole("button")...click()', test: all('15 bags', '.click()') },
      { name: 'Asserted the POS cart count', hint: 'expect(page.getByTestId("pos-cart-count")).toHaveText("1")', test: all('pos-cart-count') }
    ]
  },
  {
    id: 'POS-3', track: 'pos', kind: 'playwright', title: 'Shift dropdown and microchip CSV upload',
    difficulty: 'Medium', topic: 'selectOption, setInputFiles', appPath: '/pos',
    hint: 'See "Clinic shift and microchip import". Fixture: batches/microchip-scans.csv.',
    scenario: 'Lead vets switch the register shift and bulk-import scanned microchip IDs from a CSV. Automate both steps and verify the result.',
    requirements: [
      'Select "vet-supervisor" on [data-testid="pos-shift-select"].',
      'Upload batches/microchip-scans.csv to [data-testid="pos-csv-upload"].',
      'Assert pos-csv-status contains "microchip-scans.csv" and "vet-supervisor", and pos-shift-label has text "vet-supervisor".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('POS-3: switch shift and import microchip scans', async ({ page }) => {
  await page.goto('/pos');

  // TODO 1: select the 'vet-supervisor' shift
  // TODO 2: upload 'batches/microchip-scans.csv'
  // TODO 3: assert the CSV status and the shift label
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('POS-3: switch shift and import microchip scans', async ({ page }) => {
  await page.goto('/pos');

  await page.getByTestId('pos-shift-select').selectOption('vet-supervisor');
  await page.getByTestId('pos-csv-upload').setInputFiles('batches/microchip-scans.csv');

  const status = page.getByTestId('pos-csv-status');
  await expect(status).toContainText('microchip-scans.csv');
  await expect(status).toContainText('vet-supervisor');
  await expect(page.getByTestId('pos-shift-label')).toHaveText('vet-supervisor');
});`,
    notes: 'Same primitives as DC-2 in a POS context; a quick confidence check. Skip if the candidate nailed DC-2.',
    guards: [
      { name: 'Used selectOption("vet-supervisor")', hint: 'getByTestId("pos-shift-select").selectOption("vet-supervisor")', test: all('pos-shift-select', '.selectOption(', 'vet-supervisor') },
      { name: 'Used setInputFiles with the CSV', hint: 'getByTestId("pos-csv-upload").setInputFiles("batches/microchip-scans.csv")', test: all('pos-csv-upload', '.setInputFiles(', 'microchip-scans.csv') },
      { name: 'Asserted the CSV status', hint: 'expect(page.getByTestId("pos-csv-status")).toContainText("microchip-scans.csv")', test: all('pos-csv-status', /toContainText|toHaveText/) }
    ]
  },
  {
    id: 'POS-4', track: 'pos', kind: 'playwright', title: 'Mock a failing endpoint (page.route)',
    difficulty: 'Medium-Hard', topic: 'Network mocking', appPath: '/pos',
    hint: 'Click "Sync Vet Cloud Receipt" and watch the Network tab: POST /api/v2/pos/cloud-receipt returns HTTP 500.',
    scenario: 'The cloud receipt endpoint is down in staging, which blocks the happy-path test. Intercept it and return a successful payload so the UI flow can be verified.',
    requirements: [
      'Register await page.route("**/api/v2/pos/cloud-receipt", ...) BEFORE the click.',
      'Fulfill with status 200, JSON content type and body { status: "SYNCED", receiptId: "PAW-999" }.',
      'Click pos-cloud-receipt-btn and assert pos-receipt-toast contains "PAW-999".'
    ],
    starterCode: `import { test, expect } from '@playwright/test';

test('POS-4: mock the failing cloud receipt endpoint', async ({ page }) => {
  await page.goto('/pos');

  // TODO: intercept '**/api/v2/pos/cloud-receipt' and fulfill with a 200 JSON payload

  await page.getByTestId('pos-cloud-receipt-btn').click();
  await expect(page.getByTestId('pos-receipt-toast')).toContainText('PAW-999');
});`,
    solutionCode: `import { test, expect } from '@playwright/test';

test('POS-4: mock the failing cloud receipt endpoint', async ({ page }) => {
  await page.goto('/pos');

  await page.route('**/api/v2/pos/cloud-receipt', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'SYNCED', receiptId: 'PAW-999' })
    });
  });

  await page.getByTestId('pos-cloud-receipt-btn').click();
  await expect(page.getByTestId('pos-receipt-toast')).toContainText('PAW-999');
});`,
    notes: 'Registration order matters. Follow-ups: route.continue with modified response, routeFromHAR, mocking only one call (times: 1), asserting the request payload.',
    guards: [
      { name: 'Intercepted the endpoint with page.route', hint: 'await page.route("**/api/v2/pos/cloud-receipt", ...)', test: all('page.route', 'cloud-receipt') },
      { name: 'Fulfilled with status 200 and the PAW-999 payload', hint: 'route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({...}) })', test: all('route.fulfill', '200', 'PAW-999') },
      { name: 'Asserted the receipt toast', hint: 'expect(page.getByTestId("pos-receipt-toast")).toContainText("PAW-999")', test: all('pos-receipt-toast', 'toContainText') }
    ]
  },
  {
    id: 'POS-5', track: 'pos', kind: 'js', title: 'TypeScript triage: analyze a CI run',
    difficulty: 'Hard', topic: 'Array manipulation, null-safety', appPath: null,
    hint: 'No UI for this one. Your function runs server-side against several hidden datasets.',
    scenario: 'After a sharded CI run you get an array of results. Implement analyzePlaywrightRun(results) so the release dashboard knows what failed. Watch out for results without an errorMessage (null).',
    requirements: [
      'failedSpecIds: ids of results with status === "failed".',
      'timeoutCount: number of results whose errorMessage contains "Timeout" (errorMessage may be null).',
      'isReleaseBlocked: true if any FAILED result has domain "pos" or "checkout" (flaky results do not block).'
    ],
    starterCode: `// Runs server-side against hidden datasets when you click Run.
// Each result: { id: 'SPEC-01', domain: 'pos' | 'checkout' | 'aquatic' | 'search',
//                status: 'failed' | 'passed' | 'flaky', errorMessage: string | null }
function analyzePlaywrightRun(results) {
  // TODO
  return {
    failedSpecIds: [],
    timeoutCount: 0,
    isReleaseBlocked: false
  };
}`,
    solutionCode: `function analyzePlaywrightRun(results) {
  const failed = results.filter((r) => r.status === 'failed');
  return {
    failedSpecIds: failed.map((r) => r.id),
    timeoutCount: results.filter((r) => r.errorMessage && r.errorMessage.includes('Timeout')).length,
    isReleaseBlocked: failed.some((r) => r.domain === 'pos' || r.domain === 'checkout')
  };
}`,
    notes: 'Watch for null-safety on errorMessage (dataset 3) and for counting flaky results as blocking (dataset 2). Follow-up: how would you type this in TypeScript (union types for status/domain)?',
    guards: []
  }
];

// Hidden datasets for the JS question + reference implementation.
const POS5_DATASETS = [
  [
    { id: 'SPEC-101', domain: 'aquatic', status: 'passed', errorMessage: null },
    { id: 'SPEC-102', domain: 'pos', status: 'failed', errorMessage: 'Timeout 5000ms waiting for vet receipt' },
    { id: 'SPEC-103', domain: 'pos', status: 'flaky', errorMessage: 'Timeout 3000ms on PAW10 spinner' },
    { id: 'SPEC-104', domain: 'search', status: 'failed', errorMessage: 'Strict mode violation: 4 pet cards' }
  ],
  [
    { id: 'SPEC-201', domain: 'pos', status: 'flaky', errorMessage: 'Timeout 3000ms' },
    { id: 'SPEC-202', domain: 'checkout', status: 'flaky', errorMessage: 'Timeout 8000ms' },
    { id: 'SPEC-203', domain: 'search', status: 'passed', errorMessage: null },
    { id: 'SPEC-204', domain: 'aquatic', status: 'failed', errorMessage: 'expect(received).toHaveCount(1)' }
  ],
  [
    { id: 'SPEC-301', domain: 'aquatic', status: 'failed', errorMessage: null },
    { id: 'SPEC-302', domain: 'checkout', status: 'failed', errorMessage: 'Timeout 30000ms exceeded' },
    { id: 'SPEC-303', domain: 'search', status: 'passed', errorMessage: null },
    { id: 'SPEC-304', domain: 'search', status: 'failed', errorMessage: 'Timeout 5000ms on search debounce' }
  ],
  []
];
function pos5Reference(results) {
  const failed = results.filter((r) => r.status === 'failed');
  return {
    failedSpecIds: failed.map((r) => r.id),
    timeoutCount: results.filter((r) => r.errorMessage && r.errorMessage.includes('Timeout')).length,
    isReleaseBlocked: failed.some((r) => r.domain === 'pos' || r.domain === 'checkout')
  };
}

const CATEGORIES = [
  { key: 'locators', label: 'Locators and tables', questions: ['DC-1', 'POS-2'] },
  { key: 'interactions', label: 'Select, upload, iframes', questions: ['DC-2', 'DC-3', 'POS-3'] },
  { key: 'architecture', label: 'Fixtures and architecture', questions: ['DC-4', 'DC-6'] },
  { key: 'sync', label: 'Waits, network, debugging', questions: ['DC-5', 'DC-7', 'POS-1', 'POS-4'] },
  { key: 'scripting', label: 'TypeScript logic', questions: ['POS-5'] }
];

const publicQuestion = (q, i, arr) => ({
  id: q.id, track: q.track, kind: q.kind, title: q.title, difficulty: q.difficulty, topic: q.topic,
  hint: q.hint, scenario: q.scenario, requirements: q.requirements, starterCode: q.starterCode,
  appPath: q.appPath, note: q.kind === 'playwright' ? BASE_NOTE : null,
  trackNum: arr.filter((x, j) => x.track === q.track && j <= i).length
});

module.exports = { QUESTIONS, CATEGORIES, POS5_DATASETS, pos5Reference, publicQuestion };
