import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/introduction">
            Read the Documentation
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeatureCard({title, description}: {title: string; description: string}) {
  return (
    <div className="col col--4">
      <div className="padding-vert--md padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Documentation"
      description="GHOST Protocol: Privacy preserving P2P lending with sealed bid rate discovery on Chainlink CRE">
      <HomepageHeader />
      <main>
        <section className="padding-vert--xl">
          <div className="container">
            <div className="row">
              <FeatureCard
                title="Sealed Bid Rate Discovery"
                description="Lenders submit encrypted rate bids that only the Chainlink CRE can decrypt. This prevents front running and ensures truthful bidding through a discriminatory price auction."
              />
              <FeatureCard
                title="Three Layer Privacy"
                description="Fund custody, blind storage, and confidential settlement are separated across independent trust domains. The server never sees plaintext rates."
              />
              <FeatureCard
                title="Confidential Compute"
                description="Chainlink CRE runs the matching engine, monitors collateral health, and executes fund transfers inside a trusted execution environment."
              />
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
