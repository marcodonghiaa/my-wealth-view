# Supported brokers

Alopex reads these broker exports on the Portfolio page (Import trades from CSV). Anything else can be
imported as a plain CSV with the columns `date, side, isin, shares, price, fee`.

<!-- This table is checked against src/lib/brokers/index.ts (brokers.test.ts). Change both together. -->

| Broker         | Accounts in             | File | Last checked with a real export |
| -------------- | ----------------------- | ---- | ------------------------------- |
| Trade Republic | DE, IT, FR, ES and more | CSV  | 2026-11-01                      |

## Your broker isn't here, or stopped working?

Open [Add my broker](https://github.com/marcodonghiaa/alopex/issues/new?template=new-broker.yml) with a
sample of its export, personal details removed. A parser is one file in `src/lib/brokers/`, a sample
in `src/lib/brokers/fixtures/` with no personal data, and a test. Pull requests are welcome.

When a broker changes its export, Alopex refuses the file instead of guessing, so nothing wrong is saved.
