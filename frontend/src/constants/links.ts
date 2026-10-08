// TODO(D-9): domains and socials are undecided. Domains are placeholders;
// socials that would point at the old project's accounts are "#" until decided.
export const site = "https://example.noctrum";

const app = "https://app.example.noctrum/";
const docs = "https://noctrum-docs.vercel.app/";

export const links = {
  app,
  lend: app,
  borrow: app,
  explore: `${app}explore`,
  raycast: "#",
  careers: `${docs}careers`,
  docs,
  litepaper: `${docs}litepaper`,
  research: `${docs}research`,
  blog: docs,
  tokenomics: `${docs}protocol/tokenomics`,
  privacyModel: `${docs}protocol/privacy-model`,
  trustModel: `${docs}protocol/trust-model`,
  creWorkflows: `${docs}cre-workflows/overview`,
  creditTiers: `${docs}incentives/credit-tiers`,
  x: "#",
  discord: "#",
  telegram: "#",
};
