const ALLOWED_ORIGIN = "https://xsetayoub.github.io";
const MODEL = "gemini-2.5-flash-lite";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin"
        }
      });
    }

    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: "Cloudflare is missing the GEMINI_API_KEY secret." }, 503);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }

    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "No messages provided." }, 400);

    const contents = [];
    for (const item of body.messages.slice(-20)) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") continue;
      const content = item.content.trim().slice(0, 12000);
      if (!content) continue;
      const role = item.role === "assistant" ? "model" : "user";
      const previous = contents[contents.length - 1];
      if (previous && previous.role === role) previous.parts[0].text += "\n\n" + content;
      else contents.push({ role, parts: [{ text: content }] });
    }

    while (contents.length && contents[0].role !== "user") contents.shift();
    if (!contents.length || contents[contents.length - 1].role !== "user") return json({ error: "A user message is required." }, 400);

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: typeof body.system === "string" ? body.system : "You are AI Boys, a helpful, friendly general-purpose AI assistant. Be conversational, clear, thoughtful, and honest. Never claim to be ChatGPT or OpenAI." }]
            },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
          })
        }
      );

      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const detail = result?.error?.message || `Gemini returned HTTP ${upstream.status}.`;
        return json({ error: detail, providerStatus: upstream.status }, 502);
      }

      const reply = result.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
      if (!reply) {
        const reason = result.promptFeedback?.blockReason
          ? `Gemini blocked the prompt: ${result.promptFeedback.blockReason}.`
          : "Gemini returned an empty response.";
        return json({ error: reason }, 502);
      }
      return json({ reply });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Could not connect to the AI provider." }, 502);
    }
  }
};