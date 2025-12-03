import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";
import { detectDataSource } from "./data-filter";

export interface IntentAnalysisResult {
  dataSource: string;
  filters: Record<string, unknown>;
  limit: number;
}

export async function analyzeIntent(userIntent: string, provider: ModelProvider = "openrouter"): Promise<IntentAnalysisResult> {
  const detectedSource = detectDataSource(userIntent);
  
  console.log(`[intent-analyzer] Detected data source: ${detectedSource} from intent: "${userIntent.substring(0, 100)}"`);
  
  const systemPrompt = `You analyze a user's request for a website and return STRICT JSON filters.
Always respond with ONLY a compact JSON object, no markdown, no backticks, no explanation.
The JSON schema is:
{
  "dataSource": "movies" | "companies" | "products" | "actors" | "directors" | "testimonials",
  "filters": {
    "year"?: number,           // For movies
    "genre"?: string,          // For movies
    "location"?: string,      // For companies, actors, directors (e.g., "Delhi, India")
    "category"?: string,      // For products
    "personas"?: string,      // For products (e.g., "Business Owners", "IT Managers")
    ...other relevant filters
  },
  "limit": number
}

Available data sources and their use cases:
- "movies": Use for movie/film content. Fields: year, genre, rating, director, actors, plot
- "companies": Use for company/business information. Fields: name, industry, location, mission, vision, people
  **IMPORTANT: "company website" = companies (even if it has a products page - the website is ABOUT the company)**
- "products": Use for products/services/tools/apps. Fields: name, category, personas, useCases, price, trialDays
  **IMPORTANT: Only use "products" for standalone product listings, NOT for company websites**
- "actors": Use for actor/actress information. Fields: name, gender, location, about, bestFilms
- "directors": Use for director/filmmaker information. Fields: name, location, bestFilms, about
- "testimonials": Use for reviews/testimonials/feedback. Fields: name, role, company, location, rating, text

CRITICAL DATA SOURCE SELECTION RULES (CHECK IN THIS ORDER):
1. If user says "movie", "movies", "film", "films", "cinema", "browse movies", "action movies", "movie genre" → use "movies"
2. **COMPANY WEBSITE RULE (HIGHEST PRIORITY FOR COMPANIES):**
   - If user says "company website", "our company", "our mission", "our vision", "our services", "company's mission", "company's vision" → use "companies" (NOT products)
   - If user mentions "mission", "vision", "about us", "our business" → use "companies"
   - "Company website with products page" = "companies" (the website is ABOUT the company, products are just a page)
3. If user says "product" or "products" (AND no company/business context) → use "products"
4. If user says "products for businesses" or "business products" (standalone products, not company website) → use "products" (filter by personas: "Business Owners")
5. If user says "company" or "business" (without "product") → use "companies"
6. If user mentions "trial", "sign up", "software", "app", "service" (AND no company website context) → use "products"
7. If user mentions "actor", "actress", "movie star" → use "actors"
8. If user mentions "director", "filmmaker" → use "directors"
9. If user mentions "testimonial", "review", "feedback" → use "testimonials"
10. DEFAULT: If unclear, use "movies" (most common use case)

KEY DISTINCTION:
- "company website" = companies data source (company info, mission, vision, people)
- "products page" or "services page" ON a company website = still companies data source
- Standalone "products" or "show me products" = products data source

Filter rules:
- "year": Single 4-digit year if specified (for movies only)
- "genre": Single lowercase word like "action", "drama", "comedy" (for movies only)
- "location": Extract ONLY if explicitly mentioned with location keywords (e.g., "in Delhi", "from Mumbai", "located in New York", "companies in Delhi")
  **CRITICAL: Only extract location if user explicitly mentions a location with words like "in", "from", "located", or a city name**
- "category": Extract for products if mentioned (e.g., "Software", "Hardware", "Mobile App")
- "personas": Extract for products if mentioned (e.g., "Business Owners", "IT Managers", "Students")
- "industry": Extract if mentioned for any data source (e.g., "tech companies", "software products")
- "limit": **CRITICAL RULES:**
  * If user says "all", "all data", "all companies", "all products", "show all", "all services" → use 100 (or higher)
  * If user says "small", "few", "top 10", "just a few" → use 20-50
  * If user doesn't specify quantity → ALWAYS use 100 (default)
  * **NEVER use limit: 1 unless user explicitly says "one", "single", or "just one"**
  * Default is ALWAYS 100 for showing all available data

Detected source hint: ${detectedSource} (but choose the correct one based on the rules above)
Never include extra fields or comments.
`;

  try {
    const client = getAnthropicClient(provider);
    const model = getDefaultModel(provider);
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 200 : 256,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `User request: "${userIntent}"

IMPORTANT: Analyze the request carefully:
- If the user wants to see "products" (even if they say "for businesses"), use dataSource: "products"
- If the user wants company information (mission, vision, about), use dataSource: "companies"
- Extract filters like location, category, personas based on what the user mentions
- For "products for businesses", use dataSource: "products" with personas filter: "Business Owners"

Return ONLY the JSON object as specified.`
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

    const filters: Record<string, unknown> = parsed.filters && typeof parsed.filters === "object"
      ? parsed.filters
      : {};

    let limit =
      typeof parsed.limit === "number" && parsed.limit > 0 && parsed.limit <= 500
        ? parsed.limit
        : 100;
    
    const userIntentLower = userIntent.toLowerCase();
    if ((userIntentLower.includes("all") || 
         userIntentLower.includes("all data") ||
         userIntentLower.includes("all companies") ||
         userIntentLower.includes("all products") ||
         userIntentLower.includes("show all") ||
         userIntentLower.includes("all services")) && 
        limit < 50) {
      console.warn(`[intent-analyzer] ⚠ User wants "all" data but limit is ${limit}. Increasing to 100.`);
      limit = 100;
    }
    
    if (limit === 1 && 
        !userIntentLower.includes("one") && 
        !userIntentLower.includes("single") && 
        !userIntentLower.includes("just one")) {
      console.warn(`[intent-analyzer] ⚠ Limit is 1 but user didn't request "one". Increasing to 100.`);
      limit = 100;
    }

    const validSources = ["movies", "companies", "products", "actors", "directors", "testimonials"];
    const dataSource = validSources.includes(parsed.dataSource) 
      ? parsed.dataSource 
      : detectedSource;

    console.log(`[intent-analyzer] Extracted filters:`, JSON.stringify(filters, null, 2));
    console.log(`[intent-analyzer] Data source: ${dataSource}, Limit: ${limit}`);
    
    if (filters.location) {
      const userIntentLower = userIntent.toLowerCase();
      const locationValue = String(filters.location).toLowerCase();
      
      const hasLocationKeywords = userIntentLower.includes("in ") || 
                                  userIntentLower.includes("from ") ||
                                  userIntentLower.includes("located") ||
                                  userIntentLower.includes("at ");
      
      if (!userIntentLower.includes(locationValue) && !hasLocationKeywords) {
        console.warn(`[intent-analyzer] ⚠ Location filter "${filters.location}" extracted but not mentioned in intent. Removing it.`);
        delete filters.location;
      }
    }

      return {
        dataSource,
        filters,
        limit
      };
    } catch (err) {
      const intent = userIntent.toLowerCase();

    let year: number | undefined;
    const yearMatch = intent.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[0], 10);
    }

    let genre: string | undefined;
    const genres = ["action", "sci-fi", "science fiction", "drama", "comedy", "horror"];
    for (const g of genres) {
      if (intent.includes(g)) {
        genre = g === "science fiction" ? "sci-fi" : g;
        break;
      }
    }

    let location: string | undefined;
    const locationPatterns = [
      /(?:in|from|at|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s*,\s*[A-Z][a-z]+)?)/i,
      /(Delhi|Mumbai|Bangalore|Pune|Hyderabad|Chennai|Kolkata|New York|San Francisco|London|Paris)/i
    ];
    for (const pattern of locationPatterns) {
      const match = intent.match(pattern);
      if (match) {
        location = match[1] || match[0];
        break;
      }
    }

    const filters: Record<string, unknown> = {};
    if (year) filters.year = year;
    if (genre) filters.genre = genre;
    if (location) filters.location = location;

    return {
      dataSource: detectedSource,
      filters,
      limit: 100
    };
  }
}