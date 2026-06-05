# actions-pr-comment

Create, update, or delete pull request comments from GitHub Actions.

This action lets you post a comment on a pull request, update a previously posted comment in place, or clean it up — all identified by a hidden tag embedded in the comment body.

## Quick start

```yaml
on: [pull_request]

permissions:
  pull-requests: write

jobs:
  comment:
    runs-on: ubuntu-latest  
    steps:
      - uses: alexremn/actions-pr-comment@v1
        with:
          message: |
            Hello from CI :wave:
          comment-tag: greeting
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `message` | Conditional | — | Comment body. Exactly one of `message` or `file-path` is required (except `delete` mode, which needs neither). |
| `file-path` | Conditional | — | Path to a file whose contents become the comment body. |
| `github-token` | No | `${{ github.token }}` | GitHub token used to read and write comments. |
| `reactions` | No | — | Comma-separated reactions to add to the comment. Allowed values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`. |
| `pr-number` | No | Event context | Target pull request number. Defaults to the PR/issue number from the triggering event. |
| `comment-tag` | No | — | Hidden identifier (`<!-- actions-pr-comment:TAG -->`) embedded in the comment to find, update, or delete a previous comment. |
| `mode` | No | `upsert` | One of `upsert`, `recreate`, `delete`, `delete-on-completion`. |
| `create-if-not-exists` | No | `true` | When the tagged comment is not found, create it (applies to `upsert` and `delete-on-completion`). |

## Outputs

| Output | Description |
|---|---|
| `id` | The comment ID. |
| `body` | The final comment body. |
| `html-url` | The URL of the comment on GitHub. |

## Modes

### upsert

Finds the tagged comment and updates it in place. If no tagged comment exists and `create-if-not-exists` is `true` (the default), a new comment is created. This is the default mode and is suitable for comments that should be kept current throughout a workflow run.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    message: Build passed.
    comment-tag: build-status
    mode: upsert
```

### recreate

Deletes the existing tagged comment (if found) and posts a fresh one. Use this when you want a clean comment rather than an in-place edit, for example to reset the position in the comment thread.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    message: Fresh report attached.
    comment-tag: report
    mode: recreate
```

### delete

Deletes the tagged comment. If no matching comment is found, the step is a no-op. No `message` or `file-path` is needed.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    comment-tag: build-status
    mode: delete
```

### delete-on-completion

Creates or updates the comment immediately (same as `upsert`), then automatically deletes it in a post step when the job finishes. This is useful for ephemeral status comments that should not linger after the job completes. The deletion is handled by the action's post step — no extra step is required.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    message: Tests are running, please wait...
    comment-tag: in-progress
    mode: delete-on-completion
```

## Reactions

Add emoji reactions to the posted comment by providing a comma-separated list of reaction names.

Allowed values: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`, `rocket`, `eyes`.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    message: Deployment complete!
    comment-tag: deploy
    reactions: rocket,heart
```

## File content

Use `file-path` instead of `message` to read the comment body from a file. This is handy for posting generated reports or multi-line output.

```yaml
- uses: alexremn/actions-pr-comment@v1
  with:
    file-path: ./report.md
    comment-tag: coverage-report
```

## Permissions

The workflow must grant write access to pull requests:

```yaml
permissions:
  pull-requests: write
```

The default `github-token` (`${{ github.token }}`) is sufficient for all operations — no extra configuration is needed.

## Development

Install dependencies:

```bash
npm ci
```

Run the test suite:

```bash
npm test
```

Type-check without emitting:

```bash
npm run typecheck
```

Build the action bundle:

```bash
npm run build
```

After any change to `src/`, you must rebuild and commit the regenerated `dist/` directory. CI enforces that `dist/` is up to date with the source.
