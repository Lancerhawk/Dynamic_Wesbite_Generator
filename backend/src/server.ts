import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { analyzeIntent, IntentAnalysisResult } from "./intent-analyzer";
import { rephraseIntent } from "./intent-rephraser";
import { verifyDataSource } from "./data-source-verifier";
import { filterData, DataItem } from "./data-filter";
import { generateWebsite, getGenerationStatus, getProjectLogs, GenerationStatus } from "./website-generator";
import { generateFile } from "./file-generator";
import { ModelProvider } from "./anthropic-client";

// Determine project root - works in both development and production (Render)
const PROJECT_ROOT = process.env.NODE_ENV === 'production' 
  ? path.resolve(__dirname, "..") // In production, backend is the root
  : path.resolve(__dirname, "..", ".."); // In development, go up two levels

// Load .env file if it exists (for local development)
// Check multiple locations: root .env, backend/.env, or use system env vars
const rootEnvPath = path.join(PROJECT_ROOT, ".env");
const backendEnvPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(rootEnvPath)) {
  // Root .env file (preferred for local development)
  dotenv.config({ path: rootEnvPath });
  console.log("[server] Loaded .env from project root");
} else if (fs.existsSync(backendEnvPath)) {
  // Backend/.env file (alternative location)
  dotenv.config({ path: backendEnvPath });
  console.log("[server] Loaded .env from backend directory");
} else {
  // In production (Render), environment variables are set directly
  // Also works if no .env file exists (uses system environment variables)
  dotenv.config();
  console.log("[server] Using system environment variables");
}

const app = express();

// CORS configuration - allow frontend domain
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  process.env.FRONTEND_URL || 'https://your-frontend-name.vercel.app' // Replace with your Vercel frontend URL
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Data paths - handle both development and production
// In production (Render), data folder should be in backend directory or copied during build
const DATA_ROOT = process.env.NODE_ENV === 'production'
  ? (fs.existsSync(path.join(__dirname, "..", "data")) 
      ? path.join(__dirname, "..", "data")
      : path.join(PROJECT_ROOT, "data"))
  : path.join(PROJECT_ROOT, "data");

const GENERATED_SITES_ROOT = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, "..", "generated-sites")
  : path.join(PROJECT_ROOT, "generated-sites");

if (!fs.existsSync(GENERATED_SITES_ROOT)) {
  fs.mkdirSync(GENERATED_SITES_ROOT, { recursive: true });
}

interface AnalyzeIntentRequestBody {
  intent: string;
  provider?: ModelProvider;
}

app.post("/api/analyze-intent", async (req: Request<unknown, unknown, AnalyzeIntentRequestBody>, res: Response) => {
  try {
    const { intent, provider = "openrouter" } = req.body;
    if (!intent || typeof intent !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'intent' in request body." });
    }

    const analysis: IntentAnalysisResult = await analyzeIntent(intent, provider);
    return res.json(analysis);
  } catch (err) {
    console.error("Error in /api/analyze-intent:", err);
    return res.status(500).json({ error: "Failed to analyze intent." });
  }
});

interface ExtractWebsiteDetailsRequestBody {
  intent: string;
  provider?: ModelProvider;
}

interface GenerateWebsiteRequestBody {
  intent: string;
  provider?: ModelProvider;
  websiteDetails?: {
    websiteName?: string;
    tagline?: string;
    description?: string;
  };
}

app.post("/api/extract-website-details", async (req: Request<unknown, unknown, ExtractWebsiteDetailsRequestBody>, res: Response) => {
  try {
    const { intent, provider = "openrouter" } = req.body;
    if (!intent || typeof intent !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'intent' in request body." });
    }

    const { extractWebsiteDetails } = await import("./website-details-extractor");
    const details = await extractWebsiteDetails(intent, provider);
    return res.json(details);
  } catch (err) {
    console.error("Error in /api/extract-website-details:", err);
    return res.status(500).json({ error: "Failed to extract website details." });
  }
});

app.post(
  "/api/generate-website",
  async (req: Request<unknown, unknown, GenerateWebsiteRequestBody>, res: Response) => {
    try {
      const { intent, provider = "openrouter", websiteDetails } = req.body;
      if (!intent || typeof intent !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'intent' in request body." });
      }

      const projectId = `project-${Date.now()}`;
      const { startLogCapture } = await import("./website-generator");
      startLogCapture(projectId);

      res.json({
        projectId: projectId,
        status: "in_progress",
        message: "Generation started"
      });

      (async () => {
        try {
          console.log(`[server] Rephrasing user intent...`);
          const rephrasedIntent = await rephraseIntent(intent, provider);
          console.log(`[server] Rephrased intent: ${rephrasedIntent}`);
          
          const analysis = await analyzeIntent(rephrasedIntent, provider);
          
          const { detectDataSource } = await import("./data-filter");
          const detectedSource = detectDataSource(intent);
          const availableSources = ["movies", "companies", "products", "actors", "directors", "testimonials"];
          
          console.log(`[server] Verifying data source: detected "${detectedSource}", analysis returned "${analysis.dataSource}"`);
          const verifiedSource = await verifyDataSource(
            analysis.dataSource,
            intent,
            availableSources,
            provider
          );
          
          if (verifiedSource !== analysis.dataSource) {
            console.log(`[server] AI corrected data source: ${analysis.dataSource} → ${verifiedSource}`);
            analysis.dataSource = verifiedSource;
          } else {
            console.log(`[server] AI confirmed data source: ${verifiedSource}`);
          }
          const filteredData: DataItem[] = filterData(
            analysis.dataSource,
            { ...analysis.filters, limit: analysis.limit },
            DATA_ROOT
          );

          const { generateWebsite } = await import("./website-generator");
          await generateWebsite(
            rephrasedIntent,
            analysis,
            filteredData,
            GENERATED_SITES_ROOT,
            "/generated-sites",
            provider,
            projectId,
            websiteDetails
          );
        } catch (err) {
          console.error("Error in background generation:", err);
        }
      })();
    } catch (err) {
      console.error("Error in /api/generate-website:", err);
      return res.status(500).json({ error: "Failed to generate website." });
    }
  }
);

app.get("/api/status/:projectId", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const status = getGenerationStatus(projectId);
    if (!status) {
      return res.status(404).json({ error: "Project not found." });
    }
    return res.json(status);
  } catch (err) {
    console.error("Error in /api/status/:projectId:", err);
    return res.status(500).json({ error: "Failed to get status." });
  }
});

app.get("/api/logs/:projectId", (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const logs = getProjectLogs(projectId);
    return res.json({ logs, projectId });
  } catch (err) {
    console.error("Error in /api/logs/:projectId:", err);
    return res.status(500).json({ error: "Failed to get logs." });
  }
});

interface GeneratePageRequestBody {
  projectId: string;
  intent: string;
  context?: string;
  location?: string;
  provider?: ModelProvider;
}

app.post("/api/generate-page", async (req: Request<unknown, unknown, GeneratePageRequestBody>, res: Response) => {
  try {
    const { projectId, intent, context, location, provider = "openrouter" } = req.body;
    
    if (!projectId || !intent) {
      return res.status(400).json({ error: "Missing 'projectId' or 'intent' in request body." });
    }

    const projectDir = path.join(GENERATED_SITES_ROOT, projectId);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: "Project not found." });
    }

    const dataJsonPath = path.join(projectDir, "data.json");
    if (!fs.existsSync(dataJsonPath)) {
      return res.status(404).json({ error: "Project data not found." });
    }

    const existingData: DataItem[] = JSON.parse(fs.readFileSync(dataJsonPath, "utf-8"));
    if (existingData.length === 0) {
      return res.status(400).json({ error: "No data available in project." });
    }

    const analysis = await analyzeIntent(intent, provider);
    
    const filters: Record<string, unknown> = { ...analysis.filters };
    if (location) filters.location = location;
    if (context) {
      const contextLower = context.toLowerCase();
      if (contextLower.includes("action")) filters.genre = "action";
      if (contextLower.includes("drama")) filters.genre = "drama";
    }

    const filteredData: DataItem[] = filterData(
      analysis.dataSource,
      { ...filters, limit: analysis.limit },
      DATA_ROOT
    );

    const fileName = `${intent.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.html`;
    const purpose = `Page for: ${intent}${context ? ` (Context: ${context})` : ""}${location ? ` (Location: ${location})` : ""}`;

    // Get list of existing HTML pages in the project
    const existingFiles = fs.readdirSync(projectDir).filter(f => f.endsWith(".html"));
    const existingPages = existingFiles.length > 0 ? existingFiles : ["index.html"];
    
    console.log(`[server] Generating dynamic page "${fileName}" for project ${projectId}`);
    // For dynamic pages, we don't have website details, so pass undefined (will use default)
    const pageContent = await generateFile(fileName, purpose, filteredData, analysis.dataSource, provider, intent, existingPages, undefined);

    const pagePath = path.join(projectDir, fileName);
    fs.writeFileSync(pagePath, pageContent, "utf-8");

    const updatedData = [...existingData, ...filteredData.filter(item => 
      !existingData.some(existing => existing.id === item.id)
    )];
    fs.writeFileSync(dataJsonPath, JSON.stringify(updatedData, null, 2), "utf-8");

    return res.json({
      success: true,
      fileName,
      filePath: pagePath,
      publicUrl: `/generated-sites/${projectId}/${fileName}`,
      message: `Page "${fileName}" generated successfully`
    });
  } catch (err) {
    console.error("Error in /api/generate-page:", err);
    return res.status(500).json({ error: "Failed to generate page." });
  }
});

app.post("/api/test-generate-website", async (_req: Request, res: Response) => {
  try {
    const intent = "I want a website showcasing 2025 action movies";
    const analysis = await analyzeIntent(intent);
    const filteredData: DataItem[] = filterData(
      analysis.dataSource,
      { ...analysis.filters, limit: analysis.limit },
      DATA_ROOT
    );

    const status: GenerationStatus = await generateWebsite(
      intent,
      analysis,
      filteredData,
      GENERATED_SITES_ROOT
    );

    return res.json({
      message: "Test website generation triggered.",
      projectId: status.projectId,
      status: status.status,
      projectPath: status.projectPath,
      publicUrl: status.publicUrl
    });
  } catch (err) {
    console.error("Error in /api/test-generate-website:", err);
    return res.status(500).json({ error: "Failed to run test generation." });
  }
});

app.use("/generated-sites", express.static(GENERATED_SITES_ROOT));
app.use("/", express.static(path.join(PROJECT_ROOT, "frontend")));

app.listen(PORT, () => {
  console.log(`AI website generator backend listening on http://localhost:${PORT}`);
});


