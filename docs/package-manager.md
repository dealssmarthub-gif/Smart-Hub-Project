# Package manager: npm only

This project uses **npm**. `package-lock.json` is the only lockfile and the source of truth for every installed version.

- Install with `npm install` (or `npm ci` for a clean, lockfile-exact install). Add or upgrade packages with `npm install <pkg>@<version>` so the lockfile is updated with them.
- Don't commit `bun.lock`, `yarn.lock` or `pnpm-lock.yaml`. Hosts pick the package manager from the lockfile they find, so a second lockfile can install different versions from the ones `package-lock.json` pins. That is how the security upgrades (`@tanstack/start-server-core` 1.169.39, `@tanstack/react-start` 1.168.60) could be skipped.
- `bunfig.toml` is still in the repo for Lovable's tooling. It sets `saveTextLockfile = true`, so any `bun install` (including one Lovable runs) writes a new `bun.lock`. If one appears in a commit, delete it in a follow-up commit.

## Checking what a deployment installed

Vercel picks npm when `package-lock.json` is the only lockfile. In the build log, look for:

1. ``Running "install" command: `npm install`...`` (not `bun install`). With only `package-lock.json` present, `npm install` installs the locked versions.
2. No line mentioning `bun.lock` or `bun install` anywhere in the log.

npm doesn't print individual package versions during install. To see them in a log, run `npm ls @tanstack/start-server-core @tanstack/react-start` in that environment; locally it prints a single copy of each:

```
@tanstack/react-start@1.168.60
  @tanstack/start-server-core@1.169.39
```
