import fs from "fs";
import path from "path";

export type DataItem = Record<string, any>;

interface FilterOptions {
  year?: number;
  genre?: string;
  location?: string;
  category?: string;
  limit?: number;
  [key: string]: any;
}

export function detectDataSource(intent: string): string {
  const lowerIntent = intent.toLowerCase();
  
  if (lowerIntent.includes("movie") || lowerIntent.includes("movies") ||
      lowerIntent.includes("film") || lowerIntent.includes("films") ||
      lowerIntent.includes("cinema") || lowerIntent.includes("browse") && lowerIntent.includes("movie") ||
      lowerIntent.includes("action") && (lowerIntent.includes("movie") || lowerIntent.includes("genre")) ||
      lowerIntent.includes("genre") && lowerIntent.includes("movie")) {
    return "movies";
  }
  
  if (lowerIntent.includes("testimonial") || lowerIntent.includes("testimonials") ||
      lowerIntent.includes("review") && !lowerIntent.includes("movie") ||
      lowerIntent.includes("customer feedback") || lowerIntent.includes("customer review")) {
    return "testimonials";
  }
  
  if (lowerIntent.includes("actor") || lowerIntent.includes("actress") ||
      lowerIntent.includes("movie star") || lowerIntent.includes("celebrity actor")) {
    return "actors";
  }
  
  if (lowerIntent.includes("director") || lowerIntent.includes("filmmaker") ||
      lowerIntent.includes("directed by")) {
    return "directors";
  }
  
  if (lowerIntent.includes("company website") || lowerIntent.includes("business website") ||
      lowerIntent.includes("our company") || lowerIntent.includes("our business") ||
      lowerIntent.includes("company's mission") || lowerIntent.includes("company's vision") ||
      lowerIntent.includes("our mission") || lowerIntent.includes("our vision") ||
      lowerIntent.includes("our services") || lowerIntent.includes("company's services")) {
    return "companies";
  }
  
  if (lowerIntent.includes("company") || lowerIntent.includes("business") || 
      lowerIntent.includes("corporate")) {
    if (lowerIntent.includes("mission") || lowerIntent.includes("vision") || 
        lowerIntent.includes("about") || lowerIntent.includes("our")) {
      return "companies";
    }
  }
  
  if ((lowerIntent.includes(" product") || lowerIntent.includes("products")) && 
      !lowerIntent.includes("movie") && !lowerIntent.includes("film")) {
    if (lowerIntent.includes("company") || lowerIntent.includes("business")) {
      if (lowerIntent.includes("products for") || lowerIntent.includes("show me products")) {
        return "products";
      }
      return "companies";
    }
    return "products";
  }
  
  if (lowerIntent.includes("company") || lowerIntent.includes("business") || 
      lowerIntent.includes("corporate") || lowerIntent.includes("mission") || 
      lowerIntent.includes("vision") || lowerIntent.includes("about us")) {
    return "companies";
  }
  
  if (!lowerIntent.includes("movie") && !lowerIntent.includes("film") &&
      (lowerIntent.includes("trial") || lowerIntent.includes("sign up") ||
       lowerIntent.includes("software") || lowerIntent.includes("app") ||
       lowerIntent.includes("service") || lowerIntent.includes("tool"))) {
    return "products";
  }
  
  return "movies";
}

export function loadData(dataSource: string, dataRoot: string): DataItem[] {
  const filePath = path.join(dataRoot, `${dataSource}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`[data-filter] Data file not found: ${filePath}, falling back to movies.json`);
    const fallbackPath = path.join(dataRoot, "movies.json");
    if (fs.existsSync(fallbackPath)) {
      const raw = fs.readFileSync(fallbackPath, "utf-8");
      return JSON.parse(raw);
    }
    return [];
  }
  
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  
  return Array.isArray(json) ? json : [];
}

export function filterData(
  dataSource: string,
  filters: Record<string, unknown>,
  dataRoot: string
): DataItem[] {
  const allData = loadData(dataSource, dataRoot);
  
  console.log(`[data-filter] Filtering ${dataSource} data. Total records: ${allData.length}`);
  console.log(`[data-filter] Applied filters:`, JSON.stringify(filters, null, 2));
  
  const {
    year,
    genre,
    location,
    category,
    limit,
    ...otherFilters
  }: FilterOptions = {
    year: typeof filters.year === "number" ? filters.year : undefined,
    genre: typeof filters.genre === "string" ? (filters.genre as string) : undefined,
    location: typeof filters.location === "string" ? (filters.location as string) : undefined,
    category: typeof filters.category === "string" ? (filters.category as string) : undefined,
    limit: typeof filters.limit === "number" ? filters.limit : undefined,
    ...filters
  };

  let filtered = allData;

  if (dataSource === "movies") {
    if (year) {
      const beforeCount = filtered.length;
      filtered = filtered.filter((item: DataItem) => {
        const itemYear = item.Year || item.year;
        const yearStr = String(itemYear || "").slice(0, 4);
        const itemYearNum = parseInt(yearStr, 10);
        return itemYearNum === year;
      });
      console.log(`[data-filter] Year filter (${year}): ${beforeCount} → ${filtered.length}`);
    }
    
    if (genre) {
      const beforeCount = filtered.length;
      const gLower = genre.toLowerCase();
      filtered = filtered.filter((item: DataItem) => {
        const itemGenre = item.Genre || item.genre || "";
        return String(itemGenre).toLowerCase().includes(gLower);
      });
      console.log(`[data-filter] Genre filter (${genre}): ${beforeCount} → ${filtered.length}`);
    }
  } else if (dataSource === "companies") {
    if (location && location.trim() !== "") {
      const beforeCount = filtered.length;
      const locLower = location.toLowerCase().trim();
      filtered = filtered.filter((item: DataItem) => {
        const itemLocation = item.location || "";
        return String(itemLocation).toLowerCase().includes(locLower);
      });
      console.log(`[data-filter] Location filter (${location}): ${beforeCount} → ${filtered.length}`);
    }
    
    if (otherFilters.industry && typeof otherFilters.industry === "string") {
      const beforeCount = filtered.length;
      const industryLower = String(otherFilters.industry).toLowerCase();
      filtered = filtered.filter((item: DataItem) => {
        const itemIndustry = item.industry || "";
        return String(itemIndustry).toLowerCase().includes(industryLower);
      });
      console.log(`[data-filter] Industry filter (${otherFilters.industry}): ${beforeCount} → ${filtered.length}`);
    }
  } else if (dataSource === "products") {
    if (category) {
      const catLower = category.toLowerCase();
      filtered = filtered.filter((item: DataItem) => {
        const itemCategory = item.category || "";
        return String(itemCategory).toLowerCase().includes(catLower);
      });
    }
    
    if (filters.personas) {
      const personasFilter = String(filters.personas).toLowerCase();
      filtered = filtered.filter((item: DataItem) => {
        const personas = item.personas || [];
        if (Array.isArray(personas)) {
          return personas.some((p: string) => 
            String(p).toLowerCase().includes(personasFilter)
          );
        }
        return String(personas).toLowerCase().includes(personasFilter);
      });
    }
    
    if (filters.business || (typeof filters.personas === "string" && 
        filters.personas.toLowerCase().includes("business"))) {
      filtered = filtered.filter((item: DataItem) => {
        const personas = item.personas || [];
        const useCases = item.useCases || [];
        const allText = [...(Array.isArray(personas) ? personas : [personas]),
                         ...(Array.isArray(useCases) ? useCases : [useCases])]
          .join(" ").toLowerCase();
        return allText.includes("business");
      });
    }
  } else if (dataSource === "actors" || dataSource === "directors") {
    if (location) {
      const locLower = location.toLowerCase();
      filtered = filtered.filter((item: DataItem) => {
        const itemLocation = item.location || "";
        return String(itemLocation).toLowerCase().includes(locLower);
      });
    }
  }

  Object.keys(otherFilters).forEach((key) => {
    const value = otherFilters[key];
    if (value !== undefined && value !== null) {
      filtered = filtered.filter((item: DataItem) => {
        const itemValue = item[key];
        if (typeof value === "string") {
          return String(itemValue || "").toLowerCase().includes(String(value).toLowerCase());
        }
        return itemValue === value;
      });
    }
  });

  if (limit && filtered.length > limit) {
    const beforeLimit = filtered.length;
    filtered = filtered.slice(0, limit);
    console.log(`[data-filter] Limit filter (${limit}): ${beforeLimit} → ${filtered.length}`);
  }

  console.log(`[data-filter] Final filtered count: ${filtered.length} ${dataSource} records`);
  
  if (filtered.length === 0 && allData.length > 0) {
    console.warn(`[data-filter] ⚠ Filtering resulted in 0 records! Returning all ${allData.length} records instead.`);
    console.warn(`[data-filter] This might indicate filters are too restrictive. Filters applied:`, JSON.stringify(filters, null, 2));
    return allData.slice(0, limit || 100);
  }

  return filtered;
}
