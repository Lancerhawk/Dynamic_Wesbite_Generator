import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";
import type { DataItem } from "./data-filter";

export interface PlannedFile {
  fileName: string;
  purpose: string;
  kind: "page" | "asset" | "script" | "style" | "data";
}

export interface ArchitecturePlan {
  files: PlannedFile[];
}

export async function planArchitecture(
  intent: string,
  filteredData: DataItem[],
  dataSource: string,
  provider: ModelProvider = "openrouter"
): Promise<ArchitecturePlan> {
  const dataSample = filteredData.slice(0, 30).map((item) => {
    const sample: any = { id: item.id || item.imdbID || item.name || "unknown" };
    if (item.title || item.Title) sample.title = item.title || item.Title;
    if (item.name) sample.name = item.name;
    if (item.year || item.Year) sample.year = item.year || item.Year;
    if (item.genre || item.Genre) sample.genre = item.genre || item.Genre;
    if (item.rating || item.imdbRating) sample.rating = item.rating || item.imdbRating;
    if (item.location) sample.location = item.location;
    if (item.category) sample.category = item.category;
    return sample;
  });

  const systemPrompt = `You are designing a static website architecture. Analyze the user's intent to determine the appropriate number of pages.
Return ONLY compact JSON matching this schema, no markdown, no backticks, no explanation:
{
  "files": [
    {
      "fileName": "index.html",
      "purpose": "Landing page listing content with filters",
      "kind": "page" | "asset" | "script"
    }
  ]
}

STRICT RULES:
- You MUST include "index.html" (home/landing page) and "app.js" (shared JavaScript) - these are REQUIRED
- DO NOT create a separate "styles.css" file - all styles will be embedded in HTML using Tailwind CSS

**INTELLIGENT PAGE CREATION - ANALYZE USER INTENT COMPLEXITY:**

1. **SIMPLE REQUESTS** (1-2 pages total):
   - User asks to "show", "display", "list", "browse" data without mentioning specific pages
   - Examples: "show me movies", "display products", "list companies"
   - Result: ["index.html", "app.js"] ONLY

2. **MODERATE REQUESTS** (2-3 pages):
   - User mentions ONE specific page type: "about page", "contact page", "products page"
   - Examples: "show movies with an about page", "products with contact info"
   - Result: ["index.html", "about.html" OR "contact.html" OR "browse.html", "app.js"]

3. **COMPLEX REQUESTS** (4+ pages):
   - User mentions: "portfolio", "company website", "business website", "multi-page", "website with multiple pages"
   - User explicitly lists multiple pages: "about, products, contact"
   - User mentions: "mission", "vision", "services", "team", "testimonials" (business/company context)
   - Examples: "company website with about and products", "portfolio website", "business site with mission and contact"
   - Result: Create ALL mentioned pages: ["index.html", "about.html", "browse.html", "details.html", "contact.html", "app.js"]

**PAGE TYPE MAPPING:**
- "about page", "mission", "vision", "about us", "company mission", "company vision" → "about.html"
- "products page", "services page", "browse", "products", "services", "showcase" → "browse.html"
- "detail pages", "individual", "each item", "product details", "dedicated pages" → "details.html"
- "contact page", "contact information", "contact form", "location", "email" → "contact.html"

**IMPORTANT:**
- If user intent is SIMPLE (just showing/listing data), create ONLY index.html + app.js
- If user explicitly mentions pages or uses complex terms (portfolio, company, business), create those pages
- Pages MUST link using actual file paths: href="about.html" (NOT hash-based #links)
- NEVER create JSON, CSV, XML, or data files - backend provides data.json automatically
- File names must be lowercase with dashes
- index.html should have search box with id="search-input" and filters

Examples:
- "show me action movies" → SIMPLE → ["index.html", "app.js"]
- "movies with an about page" → MODERATE → ["index.html", "about.html", "app.js"]
- "company website with mission and products" → COMPLEX → ["index.html", "about.html", "browse.html", "app.js"]
- "portfolio website" → COMPLEX → ["index.html", "about.html", "browse.html", "contact.html", "app.js"]`;

  try {
    const client = getAnthropicClient(provider);
    const model = getDefaultModel(provider);
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 800 : 512, 
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `User intent: ${intent}\n` +
                `Data source: ${dataSource}\n` +
                `Here is a small sample of the filtered data (JSON):\n` +
                JSON.stringify(dataSample).slice(0, 2000) +
                `\n\n🚨 ANALYZE INTENT COMPLEXITY - READ CAREFULLY: 🚨\n` +
                `1. Is this a SIMPLE request? (just showing/listing data without page mentions)\n` +
                `   → Create ONLY: ["index.html", "app.js"]\n` +
                `2. Is this a MODERATE request? (mentions ONE specific page type)\n` +
                `   → Create: ["index.html", "mentioned-page.html", "app.js"]\n` +
                `3. Is this a COMPLEX request? (mentions "portfolio", "company", "business", "multi-page", or lists multiple pages)\n` +
                `   → Create ALL mentioned pages: ["index.html", "about.html", "browse.html", "contact.html", "app.js"]\n` +
                `\nAnalyze the intent above and determine the appropriate page count. Return ONLY the JSON architecture object.`
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
    
    console.log(`[architecture-planner] Raw AI response (first 500 chars): ${jsonText.substring(0, 500)}`);
    
    const parsed = JSON.parse(jsonText);

    if (!parsed.files || !Array.isArray(parsed.files)) {
      console.error(`[architecture-planner] Invalid response structure. Parsed:`, parsed);
      throw new Error("Invalid architecture response: missing files array");
    }
    
    console.log(`[architecture-planner] AI planned ${parsed.files.length} files:`, parsed.files.map((f: any) => f.fileName).join(", "));
    
    // Smart page detection based on intent complexity
    const intentLower = intent.toLowerCase();
    const isSimpleRequest = !intentLower.match(/\b(portfolio|company|business|multi-page|website|about|contact|products|services|mission|vision|team|testimonials)\b/);
    const isComplexRequest = intentLower.match(/\b(portfolio|company|business|multi-page|website)\b/) || 
                             (intentLower.match(/\b(about|contact|products|services|mission|vision)\b/g)?.length || 0) >= 2;
    
    // Only add pages if it's NOT a simple request
    if (!isSimpleRequest) {
      const requestedPages: string[] = [];
      if (intentLower.includes("about") || intentLower.includes("mission") || intentLower.includes("vision")) {
        requestedPages.push("about.html");
      }
      if (intentLower.includes("product") || intentLower.includes("service") || intentLower.includes("browse")) {
        requestedPages.push("browse.html");
      }
      if (intentLower.includes("detail") || intentLower.includes("individual")) {
        requestedPages.push("details.html");
      }
      if (intentLower.includes("contact")) {
        requestedPages.push("contact.html");
      }
      
      // For complex requests, ensure all mentioned pages are included
      if (isComplexRequest && requestedPages.length > 0) {
        const missingPages = requestedPages.filter(page => !parsed.files.some((f: any) => f.fileName === page));
        if (missingPages.length > 0) {
          console.warn(`[architecture-planner] ⚠ Complex request detected - adding missing pages: ${missingPages.join(", ")}`);
          for (const page of missingPages) {
            const purpose = page === "about.html" ? "About page with mission and vision" :
                           page === "browse.html" ? "Browse page for products/services" :
                           page === "details.html" ? "Detail pages for individual items" :
                           "Contact page with location and email";
            if (!parsed.files.some((f: any) => f.fileName === page)) {
              parsed.files.push({ fileName: page, purpose, kind: "page" });
            }
          }
          console.log(`[architecture-planner] After adding missing pages: ${parsed.files.length} files`);
        }
      }
    } else {
      console.log(`[architecture-planner] Simple request detected - keeping minimal architecture`);
    }

    const files: PlannedFile[] = parsed.files
      .map((f: any) => ({
        fileName: String(f.fileName),
        purpose: String(f.purpose || "Generated file"),
        kind:
          f.kind === "page" || f.kind === "asset" || f.kind === "script" || f.kind === "style"
            ? f.kind
            : "asset"
      }))
      .filter((f: PlannedFile) => f.fileName.endsWith(".html") || f.fileName.endsWith(".js"));

    const ensureFile = (name: string, purpose: string, kind: PlannedFile["kind"]) => {
      if (!files.some((f) => f.fileName === name)) {
        files.push({ fileName: name, purpose, kind });
      }
    };

    ensureFile("index.html", "Home/landing page listing content with search and filters", "page");
    ensureFile("app.js", "Client-side interactions, search, filters, and data rendering", "script");
    
    console.log(`[architecture-planner] Final architecture: ${files.length} files -`, files.map(f => f.fileName).join(", "));

    return { files };
  } catch (err) {
    console.error(`[architecture-planner] Error parsing architecture response:`, err);
    console.error(`[architecture-planner] Falling back to minimal architecture (2 files)`);
    
    return {
      files: [
        { fileName: "index.html", purpose: "Home/landing page listing content with search and filters", kind: "page" },
        { fileName: "app.js", purpose: "Client-side interactions, search, filters, and data rendering", kind: "script" }
      ]
    };
  }
}


