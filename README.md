# Contract Pal AI

_This is a submission for the [Hacktoberfest 2026 Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)_

Small business owners and freelancers often have to read through contracts when working with clients. With the volume of work and countless responsibilities that falls on a small business owner, it's easy to miss important details. Contract Pal is a second set of eyes for your next contract! Spot red flags, understand the trade-offs, and be better prepared (and save time) when you talk with your lawyer. This utilizes your local Ollama server and models, so no confidential business data leaves your control!

**Not legal advice.** Contract Pal is not a lawyer. AI can miss issues or make mistakes. Reviews are for informational purposes only and are not a substitute for advice from a qualified lawyer.

## How it's built

A buildless HTML, CSS, and JavaScript app that helps freelancers and small business owners spot contract red flags using their own Ollama server. No framework, third-party runtime packages, API key, telemetry, or application backend is required. A bundled Node.js server serves the static files locally.

## Run locally

No .env file to configure! Simply serve this page on your machine and it connects to your local Ollama server, even if it's on another machine on your network ([how to expose Ollama on your network](https://docs.ollama.com/faq#how-can-i-expose-ollama-on-my-network)).

Install Node.js 22 or newer, then run from the project directory:

```sh
npm start
```

Open **http://127.0.0.1:8080**. No `npm install`, build step, or Python installation is needed. You can also run `node server.js` directly. Stop the server with **Ctrl+C**.

To use a different port, for example when 8080 is occupied:

```sh
npm start -- 8081
# Equivalent: node server.js 8081
```

Open the URL printed in the terminal. Ports must be whole numbers from 1 to 65535. If you change the port, update `OLLAMA_ORIGINS` to match the new app origin if needed.

The bundled `server.js` uses only Node's built-in modules and listens on `127.0.0.1`, making it accessible from this computer. It serves only `index.html`, `styles.css`, `app.js`, `core.js`, and `favicon.svg`; repository metadata, settings files, documentation, and tests are not exposed. It supports GET and HEAD, sends the correct content types, and disables caching so changes appear after refreshing. It does not proxy Ollama requests or process contracts.

Serve over HTTP rather than opening `index.html` directly, because the app uses JavaScript modules.

1. Start [Ollama](https://ollama.com) and install a chat model, for example `ollama pull llama3.2`.
2. Open **Settings**. The defaults are `http://127.0.0.1` and port `11434`.
3. Click **Test Connection** to verify the entered address and port. This checks the API without saving settings; an empty model list still counts as a successful connection.
4. Click **Select Model**, choose a chat model, and save your settings.
5. Paste a contract and click **Analyze contract**. The example contract is optional and runs through your real selected model.

## Connection details

Requests go directly from the browser to the configured server using Ollama's [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility):

- `GET {server}/v1/models` lists models.
- `POST {server}/v1/chat/completions` sends the selected model and system/user messages.

Contract Pal has no OpenAI dependency and does not call OpenAI. The server address accepts a hostname, IPv4, or bracketed IPv6 address with HTTP or HTTPS. Enter the port separately. Settings are stored in localStorage; contract text and reviews are kept only in tab memory. Downloading a review explicitly saves it to your device. The page loads no remote fonts, scripts, or assets.

Choose a locally running model if you need local processing. Ollama can also expose cloud-backed models; selecting one may send data to its provider. Configuring a remote server sends the contract to that server.

If requests fail, confirm Ollama is running and accessible. If necessary, allow the exact app origin in `OLLAMA_ORIGINS` and restart Ollama. For example, when starting Ollama manually on Linux/macOS after stopping any running Ollama instance:

```sh
OLLAMA_ORIGINS="http://127.0.0.1:8080" ollama serve
```

If using a service or desktop app, set the environment variable for that process instead. Remote access also requires an appropriate `OLLAMA_HOST` binding and firewall configuration. Use a trusted network and protect remote access. See the [Ollama FAQ](https://docs.ollama.com/faq) for platform-specific configuration. A browser may require permission to access the local network; HTTPS pages can block HTTP requests. Running the app locally over HTTP avoids that mixed-content problem.

## Review behavior and limits

The prompt focuses on payment, scope creep, acceptance, IP ownership, confidentiality, liability, indemnification, termination, exclusivity, renewal, and disputes. It requests prioritized findings, exact supporting quotations, practical impact, missing context, and negotiation questions. Contract text is separated from system instructions and explicitly treated as untrusted data. Prompt instructions reduce but cannot eliminate prompt injection or model errors. Model output is rendered as text with a limited Markdown subset, never executed as HTML.

Reviews are cancellable and time out after ten minutes. Cancellation stops the browser request; the server may take time to stop generation. Model discovery times out after fifteen seconds. Server errors and incomplete output are surfaced. Editing the contract marks the previous review as out of date.

Inputs over 60,000 characters are rejected rather than silently split or truncated by this app. This is an input-size guard, not a guarantee that a model can hold the text. Configure your Ollama model's context window to accommodate the contract, instructions, and response; smaller models/default contexts may silently truncate input. Use shorter sections for long agreements and have a lawyer assess the agreement as a whole. An embedding model may appear in the model list but cannot perform chat reviews; choose a chat model. Quality varies with model and hardware.

**Contract Pal is not a lawyer. Reviews are for informational purposes only, are not legal advice, and are not a substitute for a qualified lawyer. AI can miss issues, invent findings, and misinterpret contract terms.**

## Checks

Use the same Node.js 22+ installation for development checks:

```sh
npm run check
npm test
```

Tests cover endpoint validation, prompt/request structure, model and completion parsing, HTTP/network failures, timeouts, cancellation, and static server behavior. Server tests check public-file responses, content types, HEAD requests, private-path rejection, allowed methods, and port validation without opening a socket. Live model quality depends on your Ollama installation.
