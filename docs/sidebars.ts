import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'introduction',
    {
      type: 'category',
      label: 'Protocol',
      collapsed: true,
      items: [
        'protocol/architecture',
        'protocol/trust-model',
        'protocol/privacy-model',
        'protocol/tokenomics',
      ],
    },
    {
      type: 'category',
      label: 'Core Mechanics',
      collapsed: true,
      items: [
        'mechanics/tick-based-rates',
        'mechanics/sealed-bid-auctions',
        'mechanics/matching-engine',
        'mechanics/collateral-system',
      ],
    },
    {
      type: 'category',
      label: 'Incentive Design',
      collapsed: true,
      items: [
        'incentives/rejection-penalty',
        'incentives/credit-tiers',
        'incentives/liquidation',
      ],
    },
    {
      type: 'category',
      label: 'Server API',
      collapsed: true,
      items: [
        'api/authentication',
        'api/lender-endpoints',
        'api/borrower-endpoints',
        'api/internal-endpoints',
      ],
    },
    {
      type: 'category',
      label: 'CRE Workflows',
      collapsed: true,
      items: [
        'cre-workflows/overview',
        'cre-workflows/settle-loans',
        'cre-workflows/execute-transfers',
        'cre-workflows/check-loans',
      ],
    },
    {
      type: 'category',
      label: 'Tools',
      collapsed: true,
      items: [
        'tools/telegram-bot',
        'tools/raycast-extension',
      ],
    },
    {
      type: 'category',
      label: 'Data Models',
      collapsed: true,
      items: [
        'data-models/state-schema',
        'data-models/transfer-reasons',
      ],
    },
    {
      type: 'category',
      label: 'Smart Contracts',
      collapsed: true,
      items: [
        'smart-contracts/ghost-vault',
        'smart-contracts/on-chain-custody',
      ],
    },
    {
      type: 'category',
      label: 'ZK Vault (Future)',
      collapsed: true,
      items: [
        'zk-vault/ascv-overview',
        'zk-vault/zk-circuits',
        'zk-vault/pedersen-commitments',
      ],
    },
    {
      type: 'category',
      label: 'Development',
      collapsed: true,
      items: [
        'development/running-locally',
        'development/e2e-testing',
        'development/cre-simulation',
      ],
    },
  ],
};

export default sidebars;
