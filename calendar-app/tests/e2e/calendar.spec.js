import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FEED = readFileSync(
  fileURLToPath(new URL('../../src/lib/__tests__/fixtures/lfx-sample.ics', import.meta.url)),
  'utf8',
);

const UPDATED_FEED = FEED.replace(
  'END:VCALENDAR',
  [
    'BEGIN:VEVENT',
    'UID:e2e-added-refresh-meeting',
    'DTSTART;TZID=America/Sao_Paulo:20260810T120000',
    'DTEND;TZID=America/Sao_Paulo:20260810T130000',
    'SUMMARY:E2E Refresh Sample',
    'DESCRIPTION:Ways to join meeting: Meeting Passcode: 123456',
    'LOCATION:https://zoom-lfx.platform.linuxfoundation.org/meeting/123456789',
    'X-MEETING-ID:123456789',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
);

const CROWDED_FEED = FEED.replace(
  'END:VCALENDAR',
  [
    ['a', 'Crowded Alpha'],
    ['b', 'Crowded Beta'],
    ['c', 'Crowded Gamma'],
  ]
    .flatMap(([id, summary]) => [
      'BEGIN:VEVENT',
      `UID:e2e-crowded-${id}`,
      'DTSTART;TZID=America/Sao_Paulo:20260810T090000',
      'DTEND;TZID=America/Sao_Paulo:20260810T100000',
      `SUMMARY:${summary}`,
      'DESCRIPTION:Ways to join meeting: Meeting Passcode: 123456',
      `LOCATION:https://zoom-lfx.platform.linuxfoundation.org/meeting/98765432${id}`,
      `X-MEETING-ID:98765432${id}`,
      'END:VEVENT',
    ])
    .concat('END:VCALENDAR')
    .join('\r\n'),
);

async function mockFeed(page) {
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: FEED,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockFeed(page);
});

test('hydrates and updates URL state', async ({ page }) => {
  await page.goto('/?view=day&date=2026-08-04&tz=UTC&q=ame&kinds=TG');

  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveClass(
    /is-active/,
  );
  await expect(page.getByRole('searchbox')).toHaveValue('ame');
  await expect(page.getByRole('button', { name: /^TG:/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page).toHaveURL(/date=2026-08-03/);
});

test('calendar statistics include year and month countdowns', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');

  const stats = page.locator('.stats-panel');
  await expect(stats).toContainText('145 days left in the year');
  await expect(stats).toContainText('23 days left in the month');
  await expect(stats).toContainText(/1 meeting this week|\d+ meetings this week/);

  const layout = await page.locator('.controlbar').evaluate((bar) => {
    const main = bar.querySelector('.controlbar-main').getBoundingClientRect();
    const stats = bar.querySelector('.stats-panel').getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    return {
      statsBelowMain: stats.top > main.bottom,
      statsCenterOffset: Math.abs(
        stats.left + stats.width / 2 - (barRect.left + barRect.width / 2),
      ),
    };
  });
  expect(layout.statsBelowMain).toBe(true);
  expect(layout.statsCenterOffset).toBeLessThan(2);
});

test('calendar statistics stay on one row on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');

  const metrics = await page.locator('.stats-panel').evaluate((panel) => ({
    rows: new Set([...panel.querySelectorAll('span')].map((item) => item.offsetTop)).size,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panelCanScroll: panel.scrollWidth > panel.clientWidth,
  }));

  expect(metrics.rows).toBe(1);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(1);
  expect(metrics.panelCanScroll).toBe(true);
});

test('day to week does not retain bottom agenda scroll', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  await page.getByRole('button', { name: /Thursday · 6 Aug 2026/ }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveClass(
    /is-active/,
  );

  await page.locator('.calendar-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveClass(
    /is-active/,
  );

  const scroll = await page.locator('.calendar-scroll').evaluate((el) => ({
    top: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }));
  expect(scroll.top).toBeLessThan(scroll.max - 80);
});

test('time marker spans the full week grid', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  const metrics = await page.locator('.weekgrid').evaluate((grid) => {
    const line = grid.querySelector('.weekgrid-now');
    const body = grid.querySelector('.weekgrid-body');
    const gutter = grid.querySelector('.weekgrid-gutter');
    return {
      lineWidth: line.getBoundingClientRect().width,
      expectedWidth:
        body.getBoundingClientRect().width - gutter.getBoundingClientRect().width,
    };
  });

  expect(metrics.lineWidth).toBeGreaterThan(metrics.expectedWidth - 2);
});

test('week grid shows Pacific, Central, China, and selected timezone time rails', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  await expect(page.locator('.weekgrid-gutter-head')).toContainText('PDT');
  await expect(page.locator('.weekgrid-gutter-head')).toContainText('CDT');
  await expect(page.locator('.weekgrid-gutter-head')).toContainText('China');
  await expect(page.locator('.weekgrid-gutter-head')).toContainText('GMT-3');
  await expect(page.locator('.weekgrid-hour-rail[data-rail="pacific"]').first()).toHaveText('20:00-1');
  await expect(page.locator('.weekgrid-hour-rail[data-rail="central"]').first()).toHaveText('22:00-1');
  await expect(page.locator('.weekgrid-hour-rail[data-rail="china"]').first()).toHaveText('11:00');
  await expect(page.locator('.weekgrid-hour-rail[data-rail="selected"]').first()).toHaveText('00:00');
  await expect(page.locator('.weekgrid-hour-rail[data-rail="china"]').nth(21)).toHaveText('08:00+1');
});

test('time format toggle switches to 12h and persists in the browser', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.getByRole('button', { name: '24h' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: '12h' }).click();
  await expect(page.getByRole('button', { name: '12h' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weekgrid-hour-rail[data-rail="pacific"]').first()).toHaveText(
    '8:00 PM-1',
  );
  await expect(page.locator('.weekgrid-hour-rail[data-rail="selected"]').first()).toHaveText(
    '12:00 AM',
  );
  await expect(
    page.evaluate(() => localStorage.getItem('riscv-calendar-time-format')),
  ).resolves.toBe('12h');

  await page.reload();
  await expect(page.getByRole('button', { name: '12h' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weekgrid-hour-rail[data-rail="china"]').first()).toHaveText(
    '11:00 AM',
  );
  await expect(page.locator('.weekgrid-hour-rail[data-rail="china"]').nth(21)).toHaveText(
    '8:00 AM+1',
  );
});

test('week grid highlights the current day header and column', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  const todayHead = page.locator('.weekgrid-col-head.is-today');
  await expect(todayHead).toHaveText('Sat 8');
  await expect(page.locator('.weekgrid-col.is-today')).toHaveCount(1);

  const colors = await page.locator('.weekgrid').evaluate((grid) => {
    const head = grid.querySelector('.weekgrid-col-head.is-today');
    const col = grid.querySelector('.weekgrid-col.is-today');
    return {
      headBg: getComputedStyle(head).backgroundColor,
      colBg: getComputedStyle(col).backgroundColor,
    };
  });
  expect(colors.headBg).toBe('rgb(211, 47, 47)');
  expect(colors.colBg).toMatch(/^rgba\(211, 47, 47, 0\.0[3-5]\d*\)$/);
});

test('weekend columns are narrower than weekday columns', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  const widths = await page.locator('.weekgrid').evaluate((grid) => {
    const heads = [...grid.querySelectorAll('.weekgrid-col-head')];
    return {
      monday: heads[0].getBoundingClientRect().width,
      friday: heads[4].getBoundingClientRect().width,
      saturday: heads[5].getBoundingClientRect().width,
      sunday: heads[6].getBoundingClientRect().width,
    };
  });

  expect(widths.monday).toBeGreaterThan(widths.saturday * 2.4);
  expect(widths.friday).toBeGreaterThan(widths.sunday * 2.4);
});

test('meeting blocks align to their hour slots', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');
  await expect(page.locator('.weekgrid-event').first()).toBeVisible();

  const alignment = await page.locator('.weekgrid').evaluate((grid) => {
    const event = [...grid.querySelectorAll('.weekgrid-event')].find((item) =>
      /^\d{2}:00$/.test(item.querySelector('.weekgrid-event-time')?.textContent?.trim() ?? ''),
    );
    const hour = Number(event?.querySelector('.weekgrid-event-time')?.textContent?.slice(0, 2));
    const column = event?.closest('.weekgrid-col');
    const slotLine = column?.querySelectorAll('.weekgrid-hour-line')[hour];
    return {
      eventTop: event?.getBoundingClientRect().top,
      lineTop: slotLine?.getBoundingClientRect().top,
      eventHeight: event?.getBoundingClientRect().height,
      rowHeight: slotLine?.getBoundingClientRect().height,
    };
  });

  expect(alignment.eventTop).toBeDefined();
  expect(Math.abs(alignment.eventTop - alignment.lineTop)).toBeLessThan(1);
  expect(alignment.eventHeight).toBeGreaterThan(alignment.rowHeight - 3);
  expect(alignment.eventHeight).toBeLessThan(alignment.rowHeight + 1);
});

test('active kind filters are explicit and easy to clear', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo&kinds=TG');

  await expect(page.getByText('Filtered: TG')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByText('Filtered: TG')).toBeHidden();
  await expect(page).not.toHaveURL(/kinds=TG/);
});

test('reset filters clears search and kind filters together', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo&q=ame&kinds=TG');

  await expect(page.getByRole('searchbox')).toHaveValue('ame');
  await expect(page.getByText('Filtered: TG')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();

  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByText('Filtered: TG')).toBeHidden();
  await expect(page).not.toHaveURL(/q=ame/);
  await expect(page).not.toHaveURL(/kinds=TG/);
});

test('empty day view invites the reader to enjoy the open day', async ({ page }) => {
  await page.goto('/?view=day&date=2026-08-08&tz=America%2FSao_Paulo');

  await expect(page.getByText(/No meetings on Saturday · 8 Aug 2026/)).toBeVisible();
  await expect(page.getByText(/Enjoy the open day/)).toBeVisible();
});

test('manual refresh reports added meetings', async ({ page }) => {
  await page.unroute('**/lfx/a092M00001JV3GBQA1');
  let serveUpdatedFeed = false;
  let requests = 0;
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: serveUpdatedFeed ? UPDATED_FEED : FEED,
    });
  });

  await page.goto('/?view=week&date=2026-08-10&tz=America%2FSao_Paulo');
  const refresh = page.getByRole('button', { name: 'Refresh calendar feed' });
  await expect(refresh).toBeEnabled();
  serveUpdatedFeed = true;
  const beforeClickRequests = requests;
  await refresh.evaluate((button) => button.click());
  await expect.poll(() => requests).toBeGreaterThan(beforeClickRequests);
  await expect(page.getByText('Updated +1 -0')).toBeVisible();
  await expect(page.getByText('Updated +1 -0')).toBeHidden({ timeout: 12_000 });
});

test('mobile layout keeps primary controls reachable without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=agenda&date=2026-08-03&tz=America%2FSao_Paulo');

  await expect(page.getByRole('heading', { name: 'Technical Meetings' })).toBeVisible();
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByRole('button', { name: /Other:/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tech Committees Explorer' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('other filter contains meetings outside TG SIG HC and CSC', async ({ page }) => {
  await page.unroute('**/lfx/a092M00001JV3GBQA1');
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: UPDATED_FEED,
    });
  });

  await page.goto('/?view=agenda&date=2026-08-10&tz=America%2FSao_Paulo&kinds=Other');

  await expect(page.getByText('Filtered: Other')).toBeVisible();
  await expect(page.getByText('E2E Refresh Sample')).toBeVisible();
  const tags = await page.locator('.agenda-row .kind-tag').allTextContents();
  expect(new Set(tags)).toEqual(new Set(['Other']));
});

test('agenda items support arrow-key movement', async ({ page }) => {
  await page.unroute('**/lfx/a092M00001JV3GBQA1');
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: CROWDED_FEED,
    });
  });

  await page.goto('/?view=agenda&date=2026-08-10&tz=America%2FSao_Paulo');

  const items = page.locator('.agenda-item');
  await expect(items.nth(1)).toBeVisible();
  await items.first().focus();
  await page.keyboard.press('ArrowDown');

  await expect(items.nth(1)).toBeFocused();
});

test('crowded week slots expose a same-time meetings popover', async ({ page }) => {
  await page.unroute('**/lfx/a092M00001JV3GBQA1');
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: CROWDED_FEED,
    });
  });

  await page.goto('/?view=week&date=2026-08-10&tz=America%2FSao_Paulo');

  await page.getByRole('button', { name: '3 meetings at 09:00' }).click();
  const popover = page.getByRole('dialog', { name: 'Meetings at 09:00' });
  await expect(popover).toBeVisible();
  await expect(popover.getByRole('button', { name: /Crowded Alpha/ })).toBeVisible();
  await popover.getByRole('button', { name: /Crowded Beta/ }).click();
  await expect(page.getByRole('dialog', { name: /Crowded Beta/ })).toBeVisible();
});

test('crowded week popover closes on outside click', async ({ page }) => {
  await page.unroute('**/lfx/a092M00001JV3GBQA1');
  await page.route('**/lfx/a092M00001JV3GBQA1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar',
      body: CROWDED_FEED,
    });
  });

  await page.goto('/?view=week&date=2026-08-10&tz=America%2FSao_Paulo');

  await page.getByRole('button', { name: '3 meetings at 09:00' }).click();
  const popover = page.getByRole('dialog', { name: 'Meetings at 09:00' });
  await expect(popover).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(popover).toBeHidden();
});

test('clicked meeting dialog keeps the rendered meeting color', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');

  const event = page.locator('.weekgrid-event').first();
  await expect(event).toBeVisible();
  const eventClasses = (await event.getAttribute('class')).split(/\s+/);
  await event.click();
  await page.mouse.move(1, 1);

  const panel = page.locator('.detail-panel');
  await expect(panel).toBeVisible();

  for (const className of eventClasses.filter(
    (name) => name.startsWith('lane-') || name === 'is-past',
  )) {
    await expect(panel).toHaveClass(new RegExp(`\\b${className}\\b`));
  }

  const colors = await page.evaluate(() => {
    const eventEl = document.querySelector('.weekgrid-event');
    const panelEl = document.querySelector('.detail-panel');
    return {
      eventBg: getComputedStyle(eventEl).backgroundColor,
      panelBg: getComputedStyle(panelEl).backgroundColor,
    };
  });
  expect(colors.panelBg).toBe(colors.eventBg);
});

test('meeting detail dialog traps keyboard focus', async ({ page }) => {
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');

  await page.locator('.weekgrid-event').first().click();
  await expect(page.getByRole('button', { name: 'Close meeting details' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.detail-join')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close meeting details' })).toBeFocused();
});

test('hover card matches the rendered meeting color and can copy details', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are browser-specific');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?view=week&date=2026-08-03&tz=America%2FSao_Paulo');

  const event = page.locator('.weekgrid-event').first();
  await expect(event).toBeVisible();
  await event.hover();
  const card = page.locator('.hovercard');
  await expect(card).toBeVisible();

  const colors = await event.evaluate((el) => {
    const card = document.querySelector('.hovercard');
    return {
      eventBg: getComputedStyle(el).backgroundColor,
      cardBg: getComputedStyle(card).backgroundColor,
    };
  });
  expect(colors.cardBg).toBe(colors.eventBg);

  await card.getByRole('button', { name: 'Copy details' }).click();
  await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain(
    'Join:',
  );
});
