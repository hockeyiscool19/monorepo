/**
 * .dependency-cruiser.cjs — hexagonal import rules for TypeScript packages
 * (hexagonal-architecture skill; the TypeScript twin of scripts/check_architecture.py).
 *
 * Install and wire, in package.json:
 *   npm i -D dependency-cruiser
 *   "scripts": { "check:architecture": "depcruise --config .dependency-cruiser.cjs src" }
 * Multi-package repository: "depcruise --config .dependency-cruiser.cjs packages/*\/src".
 * Exit code is 0 when clean and non-zero on any error-severity violation; each violation is
 * printed as `rule-name: from -> to`.
 *
 * Layout enforced per package root P (`src` or `packages/<name>/src`):
 *   P/domain/**               no I/O, no application/, no adapters/
 *   P/application/**          domain/ and application/ only (ports live in P/application/ports/)
 *   P/adapters/inbound/**     anything in-package; the composition root is adapters/inbound/bootstrap.ts
 *   P/adapters/outbound/**    anything in-package
 *   P/main.ts | P/index.ts    process entry: calls buildApp() and starts the server, nothing else
 */

// Node built-ins that perform I/O. Domain and application may not import them (with or without `node:`).
const NODE_IO = ['fs', 'http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'child_process',
  'cluster', 'worker_threads', 'readline', 'repl', 'sqlite'];

// npm packages that wrap fetch/HTTP, databases, queues, cloud SDKs or web frameworks.
const IO_PACKAGES = ['axios', 'node-fetch', 'undici', 'got', 'ky', 'superagent', 'cross-fetch',
  'isomorphic-fetch', 'hono', '@hono', 'express', 'fastify', 'koa', '@koa', 'pg', 'mysql2', 'mongodb',
  'mongoose', 'ioredis', 'redis', 'better-sqlite3', 'knex', 'prisma', '@prisma', 'drizzle-orm',
  'firebase-admin', '@google-cloud', '@aws-sdk', 'aws-sdk', 'nodemailer', 'amqplib', 'kafkajs'];

// Cross-package allowlist (multi-package repositories only). Each entry lets package `from` import
// the listed layer prefixes of package `to`; every other import across `packages/*` is forbidden.
// Depend on another package's domain and application/ports only — never on its adapters.
const CROSS_PACKAGE_ALLOW = [
  // { from: 'web', to: 'core', layers: ['domain', 'application/ports'] },
];

const PKG = '(src|packages/[^/]+/src)'; // capture group 1 = the package root
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const nodeIo = `^(node:)?(${NODE_IO.map(escape).join('|')})(/|$)`;
// Resolved packages appear as node_modules/<name>/...; a package that is not installed appears as
// its bare specifier, so both spellings are matched.
const packages = IO_PACKAGES.map(escape).join('|');
const ioPackages = `^(${packages})(/|$)|(^|/)node_modules/(${packages})(/|$)`;
const io = `${nodeIo}|${ioPackages}`;

function crossPackageRules() {
  const froms = [...new Set(CROSS_PACKAGE_ALLOW.map((a) => a.from))];
  const generic = {
    name: 'no-cross-package-imports',
    severity: 'error',
    comment: 'Packages import each other only through CROSS_PACKAGE_ALLOW (rule 6).',
    from: { path: '^packages/([^/]+)/src/' },
    to: { path: '^packages/', pathNot: '^packages/$1/' },
  };
  if (froms.length > 0) generic.from.pathNot = `^packages/(${froms.map(escape).join('|')})/src/`;
  const perPackage = froms.map((from) => ({
    name: `cross-package-${from}`,
    severity: 'error',
    comment: `${from} may import only the layers of other packages listed in CROSS_PACKAGE_ALLOW.`,
    from: { path: `^packages/${escape(from)}/src/` },
    to: {
      path: '^packages/',
      pathNot: [
        `^packages/${escape(from)}/`,
        ...CROSS_PACKAGE_ALLOW.filter((a) => a.from === from).flatMap((a) =>
          a.layers.map((layer) => `^packages/${escape(a.to)}/src/${escape(layer)}/`)),
      ].join('|'),
    },
  }));
  return [generic, ...perPackage];
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-application-or-adapters',
      severity: 'error',
      comment: 'domain/ is the innermost layer: it never imports application/ or adapters/ (rule 2).',
      from: { path: `^${PKG}/domain/` },
      to: { path: '^$1/(application|adapters)/' },
    },
    {
      name: 'domain-no-io',
      severity: 'error',
      comment: 'domain/ never imports Node I/O built-ins or HTTP/database/framework packages (rule 2).',
      from: { path: `^${PKG}/domain/` },
      to: { path: io },
    },
    {
      name: 'application-no-adapters',
      severity: 'error',
      comment: 'application/ depends on domain/ and its own ports only, never on adapters/ (rule 3).',
      from: { path: `^${PKG}/application/` },
      to: { path: '^$1/adapters/' },
    },
    {
      name: 'application-no-io',
      severity: 'error',
      comment: 'application/ never imports Node I/O built-ins or HTTP/database/framework packages (rule 3).',
      from: { path: `^${PKG}/application/` },
      to: { path: io },
    },
    {
      name: 'adapters-under-inbound-or-outbound',
      severity: 'error',
      comment: 'adapters/ has exactly two children: inbound/ and outbound/ (rule 1).',
      from: { path: `^${PKG}/adapters/(?!inbound/|outbound/)` },
      to: {},
    },
    {
      name: 'modules-live-in-a-layer',
      severity: 'error',
      comment: 'Every module sits under domain/, application/ or adapters/; only main.ts/index.ts sit at the root (rule 1).',
      from: { path: `^${PKG}/(?!domain/|application/|adapters/)`, pathNot: `^${PKG}/(main|index)\\.[cm]?[jt]sx?$` },
      to: {},
    },
    ...crossPackageRules(),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(test|spec)\\.[cm]?[jt]sx?$|(^|/)__tests__/|(^|/)tests?/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
