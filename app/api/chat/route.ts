import { NextRequest, NextResponse } from "next/server";

// Usa a Groq (https://console.groq.com) — tem camada gratuita generosa.
// Formato de chamada compatível com OpenAI.
export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  const groqMessages = [
    { role: "system", content: context },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      messages: groqMessages,
    }),
  });

  const data = await response.json();

  // Normaliza a resposta pro mesmo formato que o front-end já espera
  const text = data.choices?.[0]?.message?.content || "Não consegui gerar uma resposta agora.";
  return NextResponse.json({ content: [{ type: "text", text }] });
}
