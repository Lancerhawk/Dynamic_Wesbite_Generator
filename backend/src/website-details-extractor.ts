import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";

export interface WebsiteDetails {
  websiteName?: string;
  tagline?: string;
  description?: string;
}

export async function extractWebsiteDetails(
  userIntent: string,
  provider: ModelProvider = "openrouter"
): Promise<WebsiteDetails> {
  const systemPrompt = `You extract website details from user intent.
Return ONLY compact JSON matching this schema, no markdown, no backticks, no explanation:
{
  "websiteName": "string or null",
  "tagline": "string or null",
  "description": "string or null"
}

Extract:
- websiteName: The name of the website/company/brand if mentioned (e.g., "TechCorp", "MovieHub", "My Portfolio")
- tagline: A short tagline or slogan if mentioned
- description: A brief description of what the website is about

If not mentioned, return null for that field.
Return ONLY the JSON object.`;

  try {
    const client = getAnthropicClient(provider);
    const model = getDefaultModel(provider);
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 200 : 256,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User intent: "${userIntent}"

Extract website details from this intent. Return ONLY the JSON object.`
            }
          ]
        }
      ]
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    let jsonText = text.trim();
    
    if (jsonText.includes("```")) {
      const match = jsonText.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      if (match) {
        jsonText = match[1];
      } else {
        jsonText = jsonText.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
      }
    }
    
    const parsed = JSON.parse(jsonText);
    
    return {
      websiteName: parsed.websiteName || undefined,
      tagline: parsed.tagline || undefined,
      description: parsed.description || undefined
    };
  } catch (err) {
    console.error(`[website-details-extractor] Error extracting details:`, err);
    return {
      websiteName: undefined,
      tagline: undefined,
      description: undefined
    };
  }
}

