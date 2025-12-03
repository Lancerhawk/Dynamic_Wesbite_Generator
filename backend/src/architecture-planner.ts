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

  const systemPrompt = `You are designing a small static website architecture.
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

**MANDATORY PAGE CREATION RULES - READ CAREFULLY:**
- If the user intent mentions ANY of these, you MUST create the corresponding page:
  * "about page", "mission", "vision", "about us", "company mission", "company vision" → CREATE "about.html" (MANDATORY)
  * "products page", "services page", "browse", "products", "services", "showcase services" → CREATE "browse.html" (MANDATORY)
  * "detail pages", "individual product", "each product", "product details", "dedicated pages for each" → CREATE "details.html" (MANDATORY)
  * "contact page", "contact information", "contact form", "location", "email address" → CREATE "contact.html" (MANDATORY)
- **DO NOT BE CONSERVATIVE - if the user mentions a page type, CREATE IT!**
- **If user says "multi-page website" or lists multiple pages, create ALL of them!**

- Pages MUST link to each other using actual file paths: href="about.html", href="details.html", etc. (NOT hash-based #links)
- NEVER create any JSON, CSV, XML, or data files - the backend provides data.json automatically
- NEVER create image files, config files, or any non-code files
- File names must be lowercase with dashes (e.g., "movie-details.html", "about.html")
- index.html should have search box with id="search-input" and filters
- All pages should have navigation bar linking to other existing pages only

Examples:
- Simple intent ("show me movies" with NO page requests): ["index.html", "app.js"]
- User requests pages ("company website with about, products, details, contact"): ["index.html", "about.html", "browse.html", "details.html", "contact.html", "app.js"] ← CREATE ALL 5 PAGES!
- User says "multi-page website with about and contact": ["index.html", "about.html", "contact.html", "app.js"]`;

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
                `\n\n🚨 CRITICAL INSTRUCTIONS - READ CAREFULLY: 🚨\n` +
                `The user intent above explicitly mentions specific pages. You MUST create ALL pages mentioned:\n` +
                `- If intent mentions "about page", "mission", "vision" → CREATE "about.html"\n` +
                `- If intent mentions "products page", "services page", "browse" → CREATE "browse.html"\n` +
                `- If intent mentions "detail pages", "individual product", "each product" → CREATE "details.html"\n` +
                `- If intent mentions "contact page", "contact information", "location", "email" → CREATE "contact.html"\n` +
                `\nDO NOT create only 2 files. If the user mentions multiple pages, create ALL of them!\n` +
                `Return ONLY the JSON architecture object with ALL required pages.`
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
    
    const intentLower = intent.toLowerCase();
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
    
    if (requestedPages.length > 0) {
      const missingPages = requestedPages.filter(page => !parsed.files.some((f: any) => f.fileName === page));
      if (missingPages.length > 0) {
        console.warn(`[architecture-planner] ⚠ User requested pages but AI didn't create them: ${missingPages.join(", ")}`);
        console.warn(`[architecture-planner] Adding missing pages...`);
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


