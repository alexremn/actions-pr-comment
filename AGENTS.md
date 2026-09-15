# AGENTS.md

GitHub Action that creates, updates, or deletes pull request comments, identified by a hidden tag embedded in the comment body.

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Bundle `src/` into `dist/` via ncc |
| `npm test` | Run the Jest test suite |
| `npm run typecheck` | Type-check without emitting |

## Architecture

All source lives in `src/` as small, single-purpose modules:

| Module | Role |
|---|---|
| `config.ts` | Parse and validate all action inputs into a typed config object |
| `context.ts` | Resolve the pull request number from the event context |
| `tag.ts` | Build and parse the hidden `<!-- actions-pr-comment:TAG -->` marker |
| `comments.ts` | GitHub API calls: list, create, update, delete, add reactions |
| `modes.ts` | Orchestrate the four modes (upsert / recreate / delete / delete-on-completion) |
| `outputs.ts` | Set action outputs (`id`, `body`, `html-url`) |
| `state.ts` | Persist data between the main step and the post step via `@actions/core` state |
| `index.ts` | Main entrypoint — wires config, context, modes, and outputs |
| `cleanup.ts` | Post-step entrypoint — reads state and deletes the comment for `delete-on-completion` |

## Entrypoints

- `dist/index.js` — main step (runs during the job).
- `dist/cleanup/index.js` — post step (runs after the job completes, used only by `delete-on-completion` mode).

## Critical rule

Any change to `src/` requires running `npm run build` and committing the regenerated `dist/` directory alongside the source changes. CI will fail if `dist/` is stale.

## Notes

- The project is ESM-only (`"type": "module"`), because `@actions/core` v3 and `@actions/github` v9 ship ESM only. Relative imports need `.js` extensions, and tests mock modules with `jest.unstable_mockModule` + dynamic `import()` (see `tests/fixtures/core.ts`).
- `docs/superpowers/` contains specs and planning documents used during development. It is gitignored and is not committed to the repository.
