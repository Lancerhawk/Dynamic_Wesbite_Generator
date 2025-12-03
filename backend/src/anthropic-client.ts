export type ModelProvider = "openrouter" | "anthropic";

interface MessageContent {
  type: string;
  text: string;
}

interface UnifiedMessage {
  role: "user" | "assistant" | "system";
  content: Array<MessageContent> | string;
}

interface UnifiedClient {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      temperature: number;
      system?: string;
      messages: UnifiedMessage[];
    }) => Promise<{
      content: Array<{ type: string; text: string }>;
      choices?: Array<{ message: { content: string } }>;
    }>;
  };
}

const clientCache: Map<ModelProvider, UnifiedClient> = new Map();

export function getAnthropicClient(provider: ModelProvider = "openrouter"): UnifiedClient {
  if (clientCache.has(provider)) {
    return clientCache.get(provider)!;
  }

  let client: UnifiedClient;

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!apiKey) {
      console.error(
        "[anthropic-client] ERROR: OPENROUTER_API_KEY is not set. Please add it to your .env file."
      );
    } else {
      console.log(
        `[anthropic-client] OpenRouter API key loaded (${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)})`
      );
    }

    client = {
      messages: {
        create: async (params: {
          model: string;
          max_tokens: number;
          temperature: number;
          system?: string;
          messages: UnifiedMessage[];
        }) => {
          const openRouterMessages: Array<{ role: string; content: string }> = [];

          if (params.system) {
            openRouterMessages.push({
              role: "system",
              content: params.system
            });
          }

          for (const msg of params.messages) {
            let textContent: string;
            if (typeof msg.content === "string") {
              textContent = msg.content;
            } else {
              textContent = msg.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n");
            }

            if (textContent) {
              openRouterMessages.push({
                role: msg.role,
                content: textContent
              });
            }
          }

          if (!apiKey) {
            throw new Error("OpenRouter API key is not configured. Please set OPENROUTER_API_KEY in your .env file.");
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
              "X-Title": process.env.OPENROUTER_SITE_NAME || "AI Website Generator",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: params.model,
              messages: openRouterMessages,
              max_tokens: params.max_tokens,
              temperature: params.temperature
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || errorData.message || "Unknown error";
            const errorCode = errorData.error?.code || response.status;
            
            // eslint-disable-next-line no-console
            console.error(`[anthropic-client] OpenRouter API Error ${response.status}:`, errorMessage);
            
            throw new Error(
              `OpenRouter API error (${errorCode}): ${errorMessage}. ` +
              `Check that your OPENROUTER_API_KEY in .env is correct.`
            );
          }

          const data = await response.json();

          if (data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            return {
              content: [
                {
                  type: "text",
                  text: typeof content === "string" ? content : JSON.stringify(content)
                }
              ],
              choices: data.choices
            };
          }

          throw new Error("Unexpected OpenRouter response format");
        }
      }
    };
  } else {
    const { Anthropic } = require("@anthropic-ai/sdk");
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

    if (!apiKey) {
      console.error(
        "[anthropic-client] ERROR: ANTHROPIC_API_KEY is not set. Please add it to your .env file."
      );
    } else {
      console.log(
        `[anthropic-client] Anthropic API key loaded (${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)})`
      );
    }

    const anthropic = new Anthropic({ apiKey });

    client = {
      messages: {
        create: async (params: {
          model: string;
          max_tokens: number;
          temperature: number;
          system?: string;
          messages: UnifiedMessage[];
        }) => {
          const anthropicMessages = params.messages.map((msg) => {
            let content: Array<{ type: string; text: string }>;
            if (typeof msg.content === "string") {
              content = [{ type: "text", text: msg.content }];
            } else {
              content = msg.content;
            }
            return {
              role: msg.role,
              content
            };
          });

          const response = await anthropic.messages.create({
            model: params.model,
            max_tokens: params.max_tokens,
            temperature: params.temperature,
            system: params.system,
            messages: anthropicMessages as any
          });

          return response as any;
        }
      }
    };
  }

  clientCache.set(provider, client);
  return client;
}

export function getDefaultModel(provider: ModelProvider = "openrouter"): string {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-4.5";
  } else {
    return process.env.ANTHROPIC_MODEL?.trim() || "claude-3-haiku-20240307";
  }
}

export const anthropicModel = getDefaultModel("openrouter");

