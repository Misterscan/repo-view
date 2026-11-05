# Lint tooling

The app uses TypeScript 7.0.2 for type checking. `typescript-eslint` 8.72.1
requires TypeScript below 6.1, so this local package gives the ESLint parser
its own TypeScript 6.0.3 runtime. The root compiler remains TypeScript 7.

The root `.npmrc` enables `install-links` so a normal `npm install` installs
this package with its isolated dependencies. Import the lint plugins through
this package rather than adding them to the root, where their TypeScript peer
requirements would conflict with the app compiler.

ESLint's core `no-duplicate-imports` rule checks duplicate imports without an
additional import plugin. Root overrides select patched `minimatch` 11.0.4 for the lint tools
until their dependency ranges include that release.

When `typescript-eslint` supports TypeScript 7, these dependencies can move
back to the root and the isolated package can be removed.
