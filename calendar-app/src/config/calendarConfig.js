export const calendarConfig = {
  projectName: 'RISC-V',
  title: 'Technical Meetings',
  logo: {
    src: './riscv-logo.svg',
    alt: 'RISC-V Logo',
  },
  homeUrl: 'https://riscv.org',

  feed: {
    url: 'https://webcal.prod.itx.linuxfoundation.org/lfx/a092M00001JV3GBQA1',
    sourceLabel: 'LFX calendar feed',
    cacheKey: 'riscv-lfx-ics-v1',
    cacheTtlMs: 15 * 60 * 1000,
  },

  storage: {
    timeFormatKey: 'riscv-calendar-time-format',
  },

  referenceTimezones: [
    { key: 'pacific', timeZone: 'America/Los_Angeles' },
    { key: 'central', timeZone: 'America/Chicago' },
    { key: 'china', timeZone: 'Asia/Shanghai', label: 'China' },
  ],

  meetingKinds: [
    {
      key: 'TG',
      pattern: /\bTGs?\b/i,
      className: 'kind-tg',
    },
    {
      key: 'SIG',
      pattern: /\bSIGs?\b/i,
      className: 'kind-sig',
    },
    {
      key: 'HC',
      pattern: /\bHCs?\b/i,
      className: 'kind-hc',
    },
    {
      key: 'CSC',
      pattern: /\bCSC\b|Certification Steering Committee/i,
      className: 'kind-csc',
    },
  ],

  fallbackKind: {
    key: 'Other',
    className: 'kind-other',
    title: 'Show meetings that are not TG, SIG, HC, or CSC',
  },

  titleCleanup: {
    noiseSuffix: /\s*\((?:new|lfx|\d{6,8})\)\s*$/i,
    dedupPrefix: /^(?:rv-lfx|risc-v-lfx|rv|risc-v)\s*[:-]?\s+/i,
  },

  resourceGroups: [
    {
      title: 'Meeting Resources',
      links: [
        {
          label: 'My Meetings (LFX)',
          href: 'https://openprofile.dev/my-meetings/',
        },
        {
          label: 'Openprofile.dev',
          href: 'https://openprofile.dev/',
        },
        {
          label: 'Meeting Guidelines',
          href: 'https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154865/RISC-V+Technical+Meetings',
        },
        {
          label: 'Disclosures',
          href: 'https://riscv.atlassian.net/wiki/spaces/HOME/pages/16154892/Meeting+Disclosures',
        },
        {
          label: 'Code of Conduct',
          href: 'https://riscv.org/code-of-conduct/',
        },
      ],
    },
    {
      title: 'Reference',
      links: [
        {
          label: 'Tech Committees Explorer',
          href: 'https://riscv.github.io/adm-tc-dashboard/?committees',
        },
        {
          label: 'Specification Development Dashboard',
          href: 'https://riscv.github.io/adm-spec-dashboard/',
        },
        {
          label: 'RISC-V Members',
          href: 'https://tech.riscv.org/members/',
        },
      ],
    },
  ],
};
