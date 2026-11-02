const ALLOWED_ORIGIN = "https://xsetayoub.github.io";
const MODEL = "gemini-2.5-flash-lite";

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403, ALLOWED_ORIGIN);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST for chat requests." }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "The AI brain is not configured yet. Add GEMINI_API_KEY to Worker secrets." }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON." }, 400);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return json({ error: "Send at least one chat message." }, 400);
    }

    const messages = body.messages.slice(-20);
    const contents = [];
    for (const item of messages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") continue;
      const content = item.content.trim().slice(0, 12000);
      if (!content) continue;
      const role = item.role === "assistant" ? "model" : "user";
      const previous = contents[contents.length - 1];
      if (previous && previous.role === role) previous.parts[0].text += "\n\n" + content;
      else contents.push({ role, parts: [{ text: content }] });
    }

    while (contents.length && contents[0].role !== "user") contents.shift();
    if (!contents.length) return json({ error: "No valid user message was found." }, 400);

    const systemInstruction = {
      parts: [{
        text: "You are AI Boys, a helpful, warm, capable general-purpose AI assistant. Be conversational, clear, and thoughtful. Understand context and follow-up questions using the conversation history. Help with learning, homework, coding, writing, brainstorming, and everyday questions. Explain difficult ideas simply and step by step when useful. Ask one focused follow-up question only when needed. Be honest about uncertainty and limitations. Never claim to be ChatGPT or OpenAI. Do not invent facts, sources, or capabilities."
      }]
    };

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction,
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
          })
        }
      );

      const result = await upstream.json();
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        return json({
          error: upstream.status === 429
            ? "AI Boys is busy right now. Please wait a moment and try again."
            : "The AI provider could not complete that request. Please try again."
        }, status);
      }

      const reply = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) return json({ error: "The AI returned an empty response. Please try again." }, 502);
      return json({ reply });
    } catch {
      return json({ error: "Could not connect to the AI provider. Please try again." }, 502);
    }
  }
};
