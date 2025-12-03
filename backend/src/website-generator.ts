import fs from "fs";
import path from "path";
import { IntentAnalysisResult } from "./intent-analyzer";
import { DataItem } from "./data-filter";
import { generateFile } from "./file-generator";
import { planArchitecture } from "./architecture-planner";
import { validateAndFixWebsite } from "./website-validator";
import { deployToVercel } from "./vercel-deployer";

export interface GenerationStatus {
  projectId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  message?: string;
  projectPath?: string;
  publicUrl?: string;
  deployedUrl?: string;
}

const statusStore = new Map<string, GenerationStatus>();

const logStore = new Map<string, Array<{ timestamp: number; message: string; level: string }>>();

export function getGenerationStatus(projectId: string): GenerationStatus | undefined {
  return statusStore.get(projectId);
}

export function getProjectLogs(projectId: string): Array<{ timestamp: number; message: string; level: string }> {
  return logStore.get(projectId) || [];
}

function addLog(projectId: string, message: string, level: string = "info") {
  if (!logStore.has(projectId)) {
    logStore.set(projectId, []);
  }
  const logs = logStore.get(projectId)!;
  logs.push({
    timestamp: Date.now(),
    message,
    level
  });
  if (logs.length > 1000) {
    logs.shift();
  }
}

let originalConsole: { log: typeof console.log; error: typeof console.error; warn: typeof console.warn } | null = null;
let currentProjectId: string | null = null;

export function startLogCapture(projectId: string) {
  currentProjectId = projectId;
  
  if (!originalConsole) {
    originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console)
    };
  }

  console.log = (...args: any[]) => {
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    if (currentProjectId) {
      addLog(currentProjectId, message, "info");
    }
    originalConsole!.log.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    if (currentProjectId) {
      addLog(currentProjectId, message, "error");
    }
    originalConsole!.error.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    if (currentProjectId) {
      addLog(currentProjectId, message, "warning");
    }
    originalConsole!.warn.apply(console, args);
  };
}

export function stopLogCapture() {
  currentProjectId = null;
}

export async function generateWebsite(
  intent: string,
  analysis: IntentAnalysisResult,
  filteredData: DataItem[],
  outputRoot: string,
  publicBasePath = "/generated-sites",
  provider: "openrouter" | "anthropic" = "openrouter",
  existingProjectId?: string
): Promise<GenerationStatus> {
  const projectId = existingProjectId || `project-${Date.now()}`;
  const projectDir = path.join(outputRoot, projectId);

  if (!existingProjectId) {
    startLogCapture(projectId);
  }

  console.log(`[website-generator] Starting generation for project ${projectId}`);

  const initialStatus: GenerationStatus = {
    projectId,
    status: "in_progress",
    message: "Starting generation",
    projectPath: projectDir,
    publicUrl: `${publicBasePath}/${projectId}/index.html`
  };
  statusStore.set(projectId, initialStatus);

  try {
    fs.mkdirSync(projectDir, { recursive: true });

    fs.writeFileSync(
      path.join(projectDir, "data.json"),
      JSON.stringify(filteredData, null, 2),
      "utf-8"
    );

    console.log(
      `[website-generator] Planning architecture with ${filteredData.length} records (${analysis.dataSource}) for project ${projectId}`
    );
    const plan = await planArchitecture(intent, filteredData, analysis.dataSource, provider);

    console.log(
      `[website-generator] Planned ${plan.files.length} files for project ${projectId}`
    );

    for (const file of plan.files) {
      console.log(`[website-generator] Generating file "${file.fileName}"...`);
      const startTime = Date.now();
      let code = await generateFile(file.fileName, file.purpose, filteredData, analysis.dataSource, provider);
      
      code = code.trim();
      if (code.includes("```")) {
        code = code.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
      }
      
      const duration = Date.now() - startTime;
      console.log(
        `[website-generator] ✓ Generated "${file.fileName}" (${code.length} chars) in ${duration}ms`
      );
      fs.writeFileSync(path.join(projectDir, file.fileName), code, "utf-8");
    }

    console.log(`[website-generator] Validating generated files...`);
    const validation = await validateAndFixWebsite(projectDir, plan.files, provider);
    
    if (validation.hasIssues) {
      console.log(`[website-generator] Fixed ${validation.fixedFiles.length} files after validation`);
      if (validation.fixedFiles.length > 0) {
        console.log(`[website-generator] Fixed files: ${validation.fixedFiles.join(", ")}`);
      }
    } else {
      console.log(`[website-generator] ✓ All files validated successfully`);
    }

    console.log(`[website-generator] ✓ Project ${projectId} completed successfully`);

    let deployedUrl: string | undefined;
    if (process.env.VERCEL_TOKEN) {
      console.log(`[website-generator] Deploying to Vercel...`);
      const deployment = await deployToVercel(projectDir, projectId);
      if (deployment.success && deployment.deployedUrl) {
        deployedUrl = deployment.deployedUrl;
        console.log(`[website-generator] ✓ Deployed to ${deployedUrl}`);
      } else {
        console.warn(`[website-generator] Deployment failed: ${deployment.error}`);
      }
    } else {
      console.log(`[website-generator] Skipping deployment (VERCEL_TOKEN not set)`);
    }

    const finalStatus: GenerationStatus = {
      projectId,
      status: "completed",
      message: deployedUrl ? "Website generated and deployed successfully" : "Website generated successfully",
      projectPath: projectDir,
      publicUrl: `${publicBasePath}/${projectId}/index.html`,
      deployedUrl
    };
    statusStore.set(projectId, finalStatus);
    stopLogCapture();
    return finalStatus;
  } catch (err) {
    console.error(`[website-generator] ✗ Project ${projectId} failed:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorStatus: GenerationStatus = {
      projectId,
      status: "failed",
      message
    };
    statusStore.set(projectId, errorStatus);
    stopLogCapture();
    return errorStatus;
  }
}