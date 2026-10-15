# Repository Guidelines

## Project Structure & Module Organization

Contract Pal is a buildless vanilla HTML, CSS, and JavaScript app. Keep browser code in ES modules without introducing a framework or backend unnecessarily.

- `index.html`: page structure, settings modal, and legal disclaimer.
- `styles.css`: responsive layout, component styles, and accessibility states.
- `app.js`: DOM interactions, settings persistence, model selection, and review rendering.
- `core.js`: server validation, analysis prompt, request construction, API handling, and response parsing.
- `tests/core.test.js`: automated core behavior tests.
- `favicon.svg`: local icon asset; `README.md`: setup and troubleshooting.

## Build, Test, and Development Commands

No build step or dependency installation is required. Use Python 3 to serve the app and Node.js 18+ for checks.

- `npm start`: serves the repository at `http://127.0.0.1:8080` using Python.
- `npm run check`: checks JavaScript syntax in `app.js` and `core.js`.
- `npm test`: runs `tests/*.test.js` with Node’s built-in test runner.
- `node tests/core.test.js`: runs the core tests directly with individual test results.

Serve over HTTP; opening `index.html` directly does not support the module workflow reliably.

## Coding Style & Naming Conventions

Match existing formatting: two-space indentation, double-quoted JavaScript strings, semicolons, and trailing commas. Files follow Prettier formatting, but no formatter or lint dependency is configured. Use camelCase for functions and variables, UPPER_SNAKE_CASE for constants, and kebab-case for HTML IDs and CSS classes. Keep reusable logic in `core.js` and browser interactions in `app.js`.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name files `*.test.js` under `tests/`. Mock network requests so tests run without Ollama. Cover meaningful changes to validation, request payloads, parsing, cancellation, and error handling. No numeric coverage threshold is configured. For UI changes, manually verify settings, model selection, analysis, keyboard access, and mobile layout; report unavailable checks.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no existing commit convention can be confirmed. Use concise imperative subjects, such as `Handle empty model lists`. Describe the problem, resulting behavior, and validation in pull requests. Link relevant issues and include screenshots for visual changes.

## Privacy & Configuration

Send contracts only to the configured Ollama server using `/v1/models` and `/v1/chat/completions`. Persist connection settings only; keep contracts and reviews in memory. Render model output through text nodes, never raw HTML. Preserve legal disclaimers and untrusted-document prompt boundaries. Use synthetic contracts in tests and screenshots.
