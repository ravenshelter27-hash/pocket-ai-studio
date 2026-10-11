# Pocket AI Studio — Full Project

A responsive ChatGPT-style web app/PWA with:
- Hosted chat through an OpenAI-compatible API (configured for OpenRouter by default)
- Server-side API key storage
- Server-persisted conversation history and character profiles (JSON file)
- Image-generation adapter for Hugging Face Inference API
- Responsive Android/mobile and desktop layout
- Optional single-user app password gate
- PWA manifest and offline shell caching

## Important free-tier note

The app software is free, but hosted model usage is controlled by providers. Free models can have rate limits, queues, outages, or be removed. Some providers require payment details even when a free quota exists. Image-generation model availability and access can vary. This project does not promise unlimited free AI.

## Requirements

- Node.js 20+
- An account/API key with a hosted AI provider
- A server or hosting service that supports Node.js and persistent storage if you want JSON-file data to persist
- For installable PWA behavior, deploy on HTTPS (localhost also works for development)

## Run locally

1. Install Node.js 20 or newer.
2. Extract the project ZIP.
3. In the project folder, copy `.env.example` to `.env`.
4. Open `.env` in a text editor and set `AI_API_KEY`.
5. Keep `AI_BASE_URL` as `https://openrouter.ai/api/v1` if using OpenRouter. Set `AI_MODEL` to a model ID currently available to your account; the example free model can change or become unavailable.
6. Optional: configure `HF_API_KEY` and `HF_IMAGE_MODEL` for Hugging Face image generation.
7. Run:
   ```bash
   npm install
   npm start
   ```
8. Open `http://localhost:3000`.

Do not paste API keys into `public/app.js`, `index.html`, or any other browser-side file.

## Hosted chat configuration

The chat endpoint uses the OpenAI-compatible `POST /chat/completions` format. You can configure any compatible provider with:
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`

For OpenRouter, create a key from your account dashboard and choose a model available to you. Model IDs, pricing, and free availability change; verify them in the provider dashboard before use.

## Image generation

The included adapter uses the Hugging Face Inference API. Set:
- `IMAGE_PROVIDER=huggingface`
- `HF_API_KEY=...`
- `HF_IMAGE_MODEL=...`

Use a model that the account and current Hugging Face inference service can access. The default is only an example; it may not be available to every account. Provider-specific policy and content rules still apply.

## Android-only setup / deployment

You can edit and upload the files using a mobile browser, but a hosted backend is required because API keys must remain server-side.

1. Choose a Node.js host that supports environment variables and persistent disk/storage.
2. Upload the extracted project folder to a private repository or the host's deploy flow.
3. Add the environment variables from `.env.example` in the host dashboard. Do not upload `.env`.
4. Deploy and open the HTTPS URL in Chrome on Android.
5. In Chrome, open the browser menu and choose **Add to Home screen** or **Install app** if shown.

Free hosting plans may sleep, limit CPU, or not preserve local files. If the host has ephemeral storage, replace `data/store.json` with a persistent database before relying on saved chats. The service worker only caches the static app shell; chat and generation require internet access.

## Private access

For a personal prototype, set a long `APP_PASSWORD` in the server environment and enter it in the app's Settings. This is a simple single-password gate, not multi-user authentication. The password is held in the current browser tab's session storage. For public/multi-user deployment, add proper authentication, per-user data isolation, CSRF protections where relevant, and a database before sharing the app.

## Data and privacy

Conversations and character profiles are stored in `data/store.json` on the server. The app currently uses one shared data store and is therefore intended for personal use or a private test deployment. Anyone with access to that server data may read it. Prompts sent to hosted models are processed by the selected provider under its terms. Avoid sending sensitive personal information.

## Troubleshooting

- **Chat says not configured:** set `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` on the server, then restart/redeploy.
- **401 from provider:** check the key and whether the model is available to the account.
- **429 / rate limit:** wait or select another model/provider.
- **Image generation not configured:** set `HF_API_KEY` and an available `HF_IMAGE_MODEL`.
- **Image model unavailable:** check current provider docs/model access and choose a supported model.
- **App password keeps failing:** enter the exact `APP_PASSWORD` in Settings; redeploy if the server variable changed.
- **Install option missing:** use HTTPS, open the app in Chrome, and reload after deployment.

## Safety and model behavior

The app lets you choose a model and tune your own prompts, but it does not remove the selected provider's safeguards or override laws and provider terms. Use licensed models and legitimate hosted endpoints.
