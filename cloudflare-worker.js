const ALLOWED_ORIGIN = "https://xsetayoub.github.io";
const MODEL = "gemini-2.5-flash";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(request.url);
    if (url.pathname !== "/api/chat") return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    if (origin !== ALLOWED_ORIGIN) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: corsHeaders });
    if (!env.GEMINI_API_KEY) return Response.json({ error: "Cloudflare is missing the GEMINI_API_KEY secret." }, { status: 500, headers: corsHeaders });

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const contents = messages
        .filter((m) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

      if (!contents.length || contents[contents.length - 1].role !== "user") {
        return Response.json({ error: "A user message is required." }, { status: 400, headers: corsHeaders });
      }

      const systemText = typeof body.system === "string" ? body.system : "You are AI Boys, a helpful assistant.";
      const apiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
          })
        }
      );

      const data = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) {
        return Response.json(
          { error: data?.error?.message || `Gemini returned HTTP ${apiResponse.status}.`, providerStatus: apiResponse.status },
          { status: 502, headers: corsHeaders }
        );
      }

      const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!reply) {
        const reason = data.promptFeedback?.blockReason
          ? `Gemini blocked the prompt: ${data.promptFeedback.blockReason}.`
          : "Gemini returned no text. Check the model response or safety feedback.";
        return Response.json({ error: reason }, { status: 502, headers: corsHeaders });
      }

      return Response.json({ reply }, { headers: corsHeaders });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Unexpected Worker error." },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};