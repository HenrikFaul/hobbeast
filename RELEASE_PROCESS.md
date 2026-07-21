# Release process

Hobbeast keeps release history in a **single** canonical file: [`CHANGELOG.md`](./CHANGELOG.md). No parallel `CHANGELOG_APPEND_*` or `UPLOAD_README_*` streams are permitted going forward — historical ones live under [`docs/releases/`](./docs/releases/) and stay read-only.

## Versioning

- Semantic versioning: `MAJOR.MINOR.PATCH`.
- The authoritative version is `package.json:version`.
- `CHANGELOG.md` must contain a section matching that version (or `[Unreleased]` during in-flight work).

## Preparing a release

1. Move `[Unreleased]` content under a new `## [X.Y.Z] — YYYY-MM-DD` section in `CHANGELOG.md`.
2. Bump `package.json:version` to `X.Y.Z`.
3. Run `npm run release:validate`. It must exit 0.
4. Commit with message `chore(release): X.Y.Z`.
5. Publish via the Lovable UI.

## Archiving historical release docs

Never delete history. Move outdated per-release notes into `docs/releases/` and reference them from the corresponding `CHANGELOG.md` entry.

## Rollback

- Revert the release commit.
- Republish the previous version from the Lovable UI.
- Add a `### Fixed` entry in `[Unreleased]` describing the rollback and root cause.

## CI enforcement

`npm run release:validate` is intended to run on every pull request. It fails when the `package.json` version does not match the latest non-`[Unreleased]` heading in `CHANGELOG.md`.
