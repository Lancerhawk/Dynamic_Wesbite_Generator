import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";

export async function rephraseIntent(
  userIntent: string,
  provider: ModelProvider = "openrouter"
): Promise<string> {
  const systemPrompt = `You are an intent rephraser. Your job is to take a user's casual or informal request and rephrase it into a clear, structured, professional format that will be used to generate a website.

Rules:
- Keep the core meaning and requirements exactly the same
- Make it clear and specific
- Add any implied requirements (like "amazing design", "proper filtering", "responsive layout") if not explicitly mentioned
- Ensure it's well-structured and easy for an AI to understand
- Return ONLY the rephrased intent, no explanations, no markdown, no backticks
- Keep it concise but complete`;

  try {
    const client = getAnthropicClient(provider);
    const model = getDefaultModel(provider);
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 200 : 256,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User's original intent: "${userIntent}"

Rephrase this into a clear, structured format that preserves all requirements and makes it easy for an AI website generator to understand. Return ONLY the rephrased intent.`
            }
          ]
        }
      ]
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const rephrased = text.trim();
    
    return rephrased.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
  } catch (err) {
    console.error("Error rephrasing intent, using original:", err);
    return userIntent;
  }
}

