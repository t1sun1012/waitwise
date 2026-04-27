# Deployment

The docs site is configured for:

```text
https://t1sun1012.github.io/waitwise/
```

## Why The Base Path Matters

Because this is a GitHub Pages project site under `t1sun1012.github.io/waitwise/`, VitePress must use:

```ts
base: '/waitwise/'
```

That setting lives in:

```text
docs/.vitepress/config.ts
```

## GitHub Pages Setup

In the GitHub repository:

1. Open Settings.
2. Open Pages.
3. Under Build and deployment, set Source to GitHub Actions.
4. Push to `main`.
5. Wait for the Deploy wAItwise docs to GitHub Pages workflow.

## Workflow

The workflow builds the VitePress site and uploads:

```text
docs/.vitepress/dist
```

GitHub Pages then publishes that artifact.

## Local Production Check

```bash
npm run docs:build
npm run docs:preview
```

Previewing locally catches broken links and base-path issues before pushing.

## Custom Domain Later

If the project later uses a custom domain such as `docs.waitwise.io` or `waitwise.io`, update the GitHub Pages custom domain settings and revisit the VitePress `base` value.

For a root custom domain, the base path would usually become:

```ts
base: '/'
```
