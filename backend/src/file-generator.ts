import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";
import type { DataItem } from "./data-filter";

export async function generateFile(
  fileName: string,
  purpose: string,
  data: DataItem[],
  dataSource: string,
  provider: ModelProvider = "openrouter"
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

  const systemPrompt = `You generate exactly ONE file for a static website called "SleekCMS Website".
You MUST output ONLY the raw file contents with no surrounding markdown, no backticks, and no commentary.
Do not include explanations, and do not mention that you are an AI.
The file will be saved directly using the content you return.
ALWAYS use "SleekCMS Website" as the website name/title, never use any other name.`;

  const baseDataJson = JSON.stringify(trimmedData);

  let userPrompt: string;

  if (fileName.endsWith(".html")) {
    const otherPages = ["index.html", "about.html", "details.html", "browse.html", "contact.html"].filter(p => p !== fileName);
    
    userPrompt = `You are generating the HTML file "${fileName}" for "SleekCMS Website".
Purpose: ${purpose}
Data source: ${dataSource}

CRITICAL REQUIREMENTS:
- Website name/title MUST be "SleekCMS Website" (never use any other name)
- Generate ONLY this one HTML file with ALL styles embedded using Tailwind CSS
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script> in the <head>
- DO NOT link to any external CSS file (no <link rel="stylesheet"> tags)
- Include a <div id="content-list"> container where content will be rendered (or id="movie-list" for movies)
- NAVIGATION MUST use actual file links, NOT hash-based routing:
  * Link to index.html: <a href="index.html">Home</a>
  * Only link to other pages if they exist: about.html, details.html, browse.html, contact.html
  * Current page should link to other existing pages: ${otherPages.join(", ")}
- Include a <script src="./app.js" defer></script> at the end of <body>
- Do NOT embed hard-coded data arrays in HTML - data will be loaded from "./data.json" by app.js
- Use Tailwind utility classes for ALL styling (no separate CSS file needed)

DESIGN CONSISTENCY REQUIREMENTS (CRITICAL):
- ALL pages MUST have the SAME design system and UI style
- Use consistent header/navigation bar design across all pages
- Use consistent color scheme: orange (#f97316), white, black, gray
- Use consistent spacing, typography, and layout patterns
- Content cards/boxes MUST have proper width constraints:
  * Use container classes: container mx-auto px-4 or max-w-7xl mx-auto
  * Cards should use: max-w-sm, max-w-md, or grid layouts with proper gap
  * NEVER use full-width content boxes - always constrain width appropriately
  * Use responsive grid: grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6
  * Each card should have: rounded-lg shadow-lg p-6 with proper max-width
- Use consistent button styles, input styles, and form elements across all pages
- Maintain the same visual hierarchy and spacing on every page

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
    userPrompt = `You are generating the JavaScript file "${fileName}" for "SleekCMS Website".
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

