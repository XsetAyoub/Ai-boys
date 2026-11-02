# AI Boys Brain

This is the secure chat API for the AI Boys website. It runs as a Cloudflare Worker and calls Gemini from the server, so the Gemini API key is never exposed in the browser.

## Free setup

1. Create a free account at https://dash.cloudflare.com/ and open **Workers & Pages**.
2. Create a Worker named `ai-boys-brain`.
3. Paste the contents of `worker.js` into the Worker editor and deploy it.
4. Open the Worker **Settings → Variables and Secrets**.
5. Add a secret named `GEMINI_API_KEY` with your key from https://aistudio.google.com/app/apikey.
6. Save and redeploy if Cloudflare asks you to.
7. Copy the Worker URL. It looks like `https://ai-boys-brain.YOUR-SUBDOMAIN.workers.dev`.

## Connect the website

The website must send chat requests to the Worker URL at `/api/chat` (append `/api/chat` only if you add a route; this Worker currently accepts POST at its root URL). Configure the frontend to POST directly to the Worker root URL. The Worker only allows requests from `https://xsetayoub.github.io`.

## Important

- Gemini's free tier has model-specific quotas and can change. A 429 response means wait and retry.
- Google's Gemini API free tier may use submitted content to improve Google products. Do not send sensitive or private information.
- Never put the API key in `index.html`, GitHub Pages files, or public source code.
- This endpoint currently handles text chat only. Image generation, user accounts, real payment processing, and server-side plan enforcement are not connected.
- Add abuse protection and server-side usage limits before inviting the public to use the service.
