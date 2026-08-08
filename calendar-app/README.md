# RISC-V Technical Meetings Calendar

React/Vite calendar for the public RISC-V International technical meetings feed.

The app reads the LFX iCalendar feed directly from:

```text
https://webcal.prod.itx.linuxfoundation.org/lfx/a092M00001JV3GBQA1
```

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

To sanity-check the production bundle locally:

```bash
npm run preview
```

To smoke-test the live public LFX feed:

```bash
npm run smoke:feed
```

The smoke command force-fetches the ICS, parses it, expands the current week,
and prints counts by meeting kind. It needs network access.

## Feed Refresh Behavior

The page force-refreshes the feed when it first loads, refreshes every five
minutes while visible, and also refreshes when the tab regains focus or comes
back online. The refresh button always bypasses the browser cache.

Important: newly added or removed LFX meetings can only appear after the public
ICS endpoint has published the change. The app can force-reload the endpoint,
but it cannot see meetings before LFX exposes them in that feed.

## Meeting Kinds

Only these meeting types get dedicated filters:

- `TG`
- `SIG`
- `HC`
- `CSC`

Every meeting that is not one of those types is classified as `Other`.

## Timezones

The header timezone selector controls the main calendar time. The week view
also shows reference time rails for `America/Los_Angeles`, `America/Chicago`,
and `Asia/Shanghai`, followed by the selected local timezone.

Times default to 24-hour display. The 12h/24h toggle is saved in the browser's
local storage.
