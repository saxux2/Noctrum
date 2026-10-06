import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Ghost Finance Docs',
  tagline: 'Privacy Preserving P2P Lending with Sealed Bid Rate Discovery',
  favicon: 'img/Ghost.png',

  future: {
    v4: true,
  },

  url: 'https://ghost-protocol.finance',
  baseUrl: '/',

  organizationName: 'ghost-protocol',
  projectName: 'ghost',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        pages: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Ghost Finance Docs',
      logo: {
        alt: 'Ghost Finance',
        src: 'img/Ghost.png',
        href: '/',
        style: { height: '28px' },
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/ghost-protocol/ghost',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'Architecture',
              to: '/protocol/architecture',
            },
            {
              label: 'API Reference',
              to: '/api/authentication',
            },
          ],
        },
        {
          title: 'Protocol',
          items: [
            {
              label: 'Rate Discovery',
              to: '/mechanics/tick-based-rates',
            },
            {
              label: 'Matching Engine',
              to: '/mechanics/matching-engine',
            },
            {
              label: 'CRE Workflows',
              to: '/cre-workflows/overview',
            },
          ],
        },
        {
          title: 'Tools',
          items: [
            {
              label: 'Telegram Bot',
              to: '/tools/telegram-bot',
            },
            {
              label: 'Raycast Extension',
              to: '/tools/raycast-extension',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/ghost-protocol/ghost',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Ghost Finance.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
