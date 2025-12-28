import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";
import type { DataItem } from "./data-filter";

export async function generateFile(
  fileName: string,
  purpose: string,
  data: DataItem[],
  dataSource: string,
  provider: ModelProvider = "openrouter",
  userIntent?: string,
  existingPages?: string[],
  websiteDetails?: { websiteName?: string; tagline?: string; description?: string }
): Promise<string> {
  const trimmedData = data.slice(0, 50).map((item) => {
    const trimmed: any = {};
    Object.keys(item).forEach((key) => {
      const value = item[key];
      if (typeof value === "string" && value.length > 200) {
        trimmed[key] = value.slice(0, 200) + "...";
      } else if (Array.isArray(value)) {
        trimmed[key] = value.slice(0, 5);
      } else {
        trimmed[key] = value;
      }
    });
    return trimmed;
  });

  // Get website name from details or use default
  const websiteName = websiteDetails?.websiteName || "SkyThought";
  
  const systemPrompt = `You generate exactly ONE file for a static website called "${websiteName}".
You MUST output ONLY the raw file contents with no surrounding markdown, no backticks, and no commentary.
Do not include explanations, and do not mention that you are an AI.
The file will be saved directly using the content you return.
ALWAYS use "${websiteName}" as the website name/title, never use any other name.`;

  const baseDataJson = JSON.stringify(trimmedData);

  // Extract design preferences from user intent
  let colorSchemeInstruction = "";
  if (userIntent) {
    const intentLower = userIntent.toLowerCase();
    // Check if user specified colors
    const colorKeywords: { [key: string]: string } = {
      "blue": "blue (#3b82f6 or similar blue shades)",
      "red": "red (#ef4444 or similar red shades)",
      "green": "green (#10b981 or similar green shades)",
      "purple": "purple (#a855f7 or similar purple shades)",
      "pink": "pink (#ec4899 or similar pink shades)",
      "yellow": "yellow (#eab308 or similar yellow shades)",
      "teal": "teal (#14b8a6 or similar teal shades)",
      "indigo": "indigo (#6366f1 or similar indigo shades)",
      "dark": "dark theme with dark colors (dark gray, black, white accents)",
      "light": "light theme with light colors (white, light gray, subtle colors)",
      "minimal": "minimal design with neutral colors (gray, white, black)",
      "modern": "modern design with vibrant colors",
      "professional": "professional design with blue and gray tones",
      "creative": "creative design with colorful palette"
    };
    
    const detectedColors: string[] = [];
    for (const [keyword, description] of Object.entries(colorKeywords)) {
      if (intentLower.includes(keyword)) {
        detectedColors.push(description);
      }
    }
    
    if (detectedColors.length > 0) {
      colorSchemeInstruction = `\n- COLOR SCHEME: User specified design preference - use ${detectedColors.join(" or ")} as the primary color scheme.`;
    } else {
      // Default to orange if no preference specified
      colorSchemeInstruction = `\n- COLOR SCHEME: Use orange (#f97316) as the primary accent color, with white, black, and gray as supporting colors.`;
    }
  } else {
    colorSchemeInstruction = `\n- COLOR SCHEME: Use orange (#f97316) as the primary accent color, with white, black, and gray as supporting colors.`;
  }

  let userPrompt: string;

  if (fileName.endsWith(".html")) {
    // Get list of actual existing pages (excluding current page)
    const allPossiblePages = ["index.html", "about.html", "details.html", "browse.html", "contact.html"];
    const actualExistingPages = existingPages || allPossiblePages;
    const otherPages = actualExistingPages.filter(p => p !== fileName && p.endsWith(".html"));
    
    userPrompt = `You are generating the HTML file "${fileName}" for "${websiteName}".
Purpose: ${purpose}
Data source: ${dataSource}
${userIntent ? `Original user request: ${userIntent}` : ""}
${websiteDetails?.tagline ? `Website tagline: ${websiteDetails.tagline}` : ""}
${websiteDetails?.description ? `Website description: ${websiteDetails.description}` : ""}

CRITICAL REQUIREMENTS:
- Website name/title MUST be "${websiteName}" (never use any other name)
${websiteDetails?.tagline ? `- Include tagline: "${websiteDetails.tagline}"` : ""}
- Generate ONLY this one HTML file with ALL styles embedded using Tailwind CSS
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script> in the <head>
- DO NOT link to any external CSS file (no <link rel="stylesheet"> tags)
- Include a <div id="content-list"> container where content will be rendered (or id="movie-list" for movies)
- NAVIGATION BAR REQUIREMENTS (CRITICAL):
  * ONLY include navigation links for pages that ACTUALLY EXIST in this project
  * Existing pages in this project: ${actualExistingPages.join(", ")}
  * Current page being generated: ${fileName}
  * Pages to link to in navigation: ${otherPages.length > 0 ? otherPages.join(", ") : "NONE (only index.html exists)"}
  * If only index.html exists, show NO navigation links (or just a logo/title)
  * If multiple pages exist, create a proper navbar with links ONLY to: ${otherPages.join(", ")}
  * DO NOT create links to pages that don't exist (like about.html, contact.html if they're not in the list above)
  * Navigation MUST use actual file paths: <a href="index.html">Home</a>, <a href="about.html">About</a>, etc.
  * Current page should NOT link to itself in navigation
- Include a <script src="./app.js" defer></script> at the end of <body>
- Do NOT embed hard-coded data arrays in HTML - data will be loaded from "./data.json" by app.js
- Use Tailwind utility classes for ALL styling (no separate CSS file needed)

DESIGN CONSISTENCY REQUIREMENTS (CRITICAL):
- ALL pages MUST have the SAME design system and UI style
- Use consistent header/navigation bar design across all pages${colorSchemeInstruction}
- Use consistent spacing, typography, and layout patterns

CARD ALIGNMENT AND LAYOUT REQUIREMENTS (CRITICAL - ESPECIALLY FOR HOMEPAGE):
- Content cards MUST be properly aligned using CSS Grid or Flexbox
- For homepage/index.html with content cards (THIS IS CRITICAL):
  * ALWAYS wrap cards in: <div class="container mx-auto px-4 py-8"><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
  * Container MUST have: class="container mx-auto px-4" or "max-w-7xl mx-auto px-4"
  * Grid container MUST have: class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
  * Each card MUST be wrapped in a div with: class="h-full" to ensure equal heights
  * Cards MUST have equal height: use "h-full" class on the OUTER card div (not inner)
  * Cards MUST be properly spaced: use "gap-6" or "gap-4" in grid (NOT margin)
  * Each card should have: "rounded-lg shadow-lg p-6 h-full" with consistent padding
  * Cards should NOT overflow or break the grid layout
  * Ensure cards are properly aligned: use "grid" not "flex" for the container
  * Cards MUST be responsive: smaller on mobile, more columns on larger screens
  * Example structure: <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"><div class="h-full"><div class="rounded-lg shadow-lg p-6 h-full">Card content</div></div></div>
- NEVER use full-width cards in a grid - they will break alignment
- NEVER mix different card widths in the same grid row
- NEVER use flexbox for the card container - use CSS Grid
- Test that cards align properly in a grid - all cards in a row should have the same height
- Use flexbox for card CONTENT if needed: "flex flex-col" inside each card div
- For homepage specifically: Double-check that cards are in a proper grid with equal heights

SEARCH AND FILTER REQUIREMENTS (if this is index.html or browse.html):
- Search box MUST have: <input type="text" id="search-input" placeholder="Search..." />
- Search box MUST have an ID of "search-input" (required for JavaScript)
- Filter dropdowns MUST have IDs: id="genre-filter", id="category-filter", id="location-filter", etc.
- Apply button MUST have: <button id="apply-filters">Apply Filters</button>
- All interactive elements MUST have unique IDs so JavaScript can attach event listeners

- Make it visually stunning with gradients, shadows, hover effects using Tailwind classes
- Add a navigation bar/header with links to other pages using actual file paths (not #hashes)
- Ensure all content is properly contained and not overflowing

Here is the filtered data (JSON) for context only (DO NOT embed it directly in the HTML):
${baseDataJson}

Now output ONLY the full HTML document for "${fileName}". Make sure the design is consistent with other pages!`;
  } else if (fileName.endsWith(".js")) {
    userPrompt = `You are generating the JavaScript file "${fileName}" for "${websiteName}".
Purpose: ${purpose}
Data source: ${dataSource}

CRITICAL REQUIREMENTS:
- Generate ONLY this one JS file
- Do NOT hard-code any data arrays - ALWAYS fetch("./data.json") and use that data
- "data.json" is in the same folder and contains the array of objects shown below
- After loading data.json, you MUST render ALL items into the element with id="content-list" or id="movie-list"
- Each item should be displayed as a beautiful card with all relevant fields from the data

SEARCH FUNCTIONALITY (MUST IMPLEMENT):
- Find the search input: const searchInput = document.getElementById("search-input");
- Add event listener: searchInput.addEventListener("input", handleSearch);
- Implement handleSearch function that filters data by searching in all text fields (title, name, description, etc.)
- Search should work in real-time as user types (use "input" event, not "change")
- Search should be case-insensitive
- Update the displayed content immediately when search text changes

FILTER FUNCTIONALITY (MUST IMPLEMENT):
- Find filter elements: document.getElementById("genre-filter"), document.getElementById("category-filter"), etc.
- Add event listeners to all filter dropdowns and the "Apply Filters" button
- When filters change, filter the data array and re-render the content
- Combine multiple filters (e.g., genre AND rating)
- Clear filters should show all data again

RENDERING FUNCTION:
- Create a function: function renderContent(data) { ... }
- This function should clear the container and render all items as cards
- Each card should display all relevant fields from the data item
- Use Tailwind CSS classes for styling (cards, grids, etc.)

DATA LOADING:
- Use: fetch("./data.json").then(res => res.json()).then(data => { ... })
- Handle errors: .catch(err => { console.error(err); show error message in UI })
- Store loaded data in a variable: let allData = []; let filteredData = [];

INITIALIZATION:
- Wait for DOM to load: document.addEventListener("DOMContentLoaded", () => { ... })
- Load data.json first
- Then set up all event listeners
- Then render initial content

- Use plain DOM APIs (document.querySelector, getElementById, addEventListener, etc.), no frameworks
- Handle fetch errors gracefully: show error message in the UI and log to console
- Make sure ALL data from data.json is visible and properly formatted - nothing should be hidden or missing

DATA STRUCTURE (this is what data.json contains):
${baseDataJson}

Now output ONLY the JavaScript contents for "${fileName}". Make sure search and filters are fully functional!`;
  } else {
    userPrompt = `You are generating the file "${fileName}" for a static website.
Purpose: ${purpose}

Important rules:
- Generate ONLY this one file.
- Use relative paths when linking local files (e.g. "./styles.css", "./app.js").

Here is the filtered data (JSON) for context:
${baseDataJson}

Now output ONLY the content of "${fileName}".`;
  }

  const client = getAnthropicClient(provider);
  const model = getDefaultModel(provider);
  const msg = await client.messages.create({
    model: model,
    max_tokens: provider === "openrouter" ? 3000 : 4000,
    temperature: 0.4,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt
          }
        ]
      }
    ]
  });

  const first = msg.content[0];
  if (first && first.type === "text") {
    let code = first.text.trim();
    
    if (code.includes("```")) {
      code = code.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
    }
    
    return code;
  }

  throw new Error("Claude did not return text content for file generation.");
}

