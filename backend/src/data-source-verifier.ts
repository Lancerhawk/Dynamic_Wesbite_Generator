import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";

export async function verifyDataSource(
  detectedSource: string,
  userIntent: string,
  availableSources: string[],
  provider: ModelProvider = "openrouter"
): Promise<string> {
  const systemPrompt = `You are a data source verifier. You verify if the detected data source is correct for a user's intent.

Available data sources: ${availableSources.join(", ")}

CRITICAL RULES:
- "company website", "our company", "our mission", "our vision", "company's mission" → ALWAYS "companies" (NOT products)
- "company website with products page" → "companies" (the website is ABOUT the company)
- Standalone "products" or "show me products" → "products"
- "products for businesses" (standalone) → "products"

Your job:
- If the detected source is CORRECT, respond with just: "CORRECT"
- If the detected source is WRONG, respond with just the correct source name (one word): "movies", "companies", "products", "actors", "directors", or "testimonials"
- Be very brief - maximum 1 word or 1 short sentence
- Only correct if it's clearly wrong`;

  try {
    const client = getAnthropicClient(provider);
    const model = getDefaultModel(provider);
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 50 : 100,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Detected data source: "${detectedSource}"
Available sources: ${availableSources.join(", ")}
User intent: "${userIntent}"

Is "${detectedSource}" correct? Respond with "CORRECT" if yes, or the correct source name if no.`
            }
          ]
        }
      ]
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    
    if (text.toUpperCase().includes("CORRECT") || text.toLowerCase() === detectedSource.toLowerCase()) {
      return detectedSource;
    }
    
    const lowerText = text.toLowerCase();
    for (const source of availableSources) {
      if (lowerText.includes(source.toLowerCase())) {
        console.log(`[data-source-verifier] AI corrected: ${detectedSource} → ${source}`);
        return source;
      }
    }
    
    console.warn(`[data-source-verifier] Could not parse AI response: "${text}", using original: ${detectedSource}`);
    return detectedSource;
  } catch (err) {
    console.error("Error verifying data source, using detected source:", err);
    return detectedSource;
  }
}

