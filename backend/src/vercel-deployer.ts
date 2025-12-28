import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export interface DeploymentResult {
  success: boolean;
  deployedUrl?: string;
  error?: string;
}

export async function deployToVercel(
  projectDir: string,
  projectName: string
): Promise<DeploymentResult> {
  const vercelToken = process.env.VERCEL_TOKEN;

  if (!vercelToken) {
    return {
      success: false,
      error: "VERCEL_TOKEN not set in environment variables. Please add it to your .env file."
    };
  }

  try {
    console.log(`[vercel-deployer] Starting deployment for ${projectName}...`);

    const vercelConfigPath = path.join(projectDir, "vercel.json");
    if (!fs.existsSync(vercelConfigPath)) {
      // Modern Vercel config for static sites
      // Vercel auto-detects static sites, but we can specify explicitly
      const vercelConfig = {
        version: 2
      };
      fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2), "utf-8");
    }

    const sanitizedName = projectName.replace(/[^a-z0-9-]/gi, "-").toLowerCase().substring(0, 50);

    console.log(`[vercel-deployer] Deploying from ${projectDir} using Vercel CLI...`);

    // Use --token flag explicitly to ensure token is passed correctly
    // --yes flag auto-confirms all prompts, --prod deploys to production
    // For Windows, we need to escape quotes differently in cmd.exe
    // The token should be passed via --token flag AND environment variable (for redundancy)
    const vercelCommand = `npx --yes vercel deploy --prod --yes --token ${vercelToken}`;
    
    console.log(`[vercel-deployer] Executing: vercel deploy from ${projectDir}...`);
    console.log(`[vercel-deployer] Token present: ${vercelToken ? "Yes (length: " + vercelToken.length + ")" : "No"}`);

    let stdout: string = "";
    let stderr: string = "";
    let commandError: Error | null = null;
    
    try {
      const result = await execAsync(vercelCommand, {
        cwd: projectDir,
        env: {
          ...process.env,
          VERCEL_TOKEN: vercelToken
        },
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
      });
      stdout = result.stdout?.toString() || "";
      stderr = result.stderr?.toString() || "";
    } catch (execError: unknown) {
      // execAsync throws an error even if the command produces output
      // Check if we have stdout/stderr which might contain the URL
      const error = execError as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
      stdout = error.stdout ? (typeof error.stdout === "string" ? error.stdout : error.stdout.toString()) : "";
      stderr = error.stderr ? (typeof error.stderr === "string" ? error.stderr : error.stderr.toString()) : "";
      
      // If there's no output at all, it's a real error
      if (!stdout && !stderr) {
        commandError = execError instanceof Error ? execError : new Error(String(execError));
      }
    }
    
    // If we had a real error with no output, throw it
    if (commandError) {
      throw commandError;
    }

    // Check for error URLs first (err.sh is Vercel's error page)
    const errorUrlMatch = (stdout + stderr).match(/https?:\/\/err\.sh\/[^\s]+/);
    if (errorUrlMatch) {
      const errorUrl = errorUrlMatch[0];
      console.error(`[vercel-deployer] Vercel returned error URL: ${errorUrl}`);
      throw new Error(`Vercel deployment failed: ${errorUrl}. Check your VERCEL_TOKEN and ensure it's valid.`);
    }

    // Look for actual deployment URLs (vercel.app, vercel.com domains)
    // Vercel CLI typically outputs: "https://project-name.vercel.app" or "Deployed to https://..."
    // Match URL pattern - be very precise to avoid capturing extra text
    const fullOutput = stdout + stderr;
    
    // First, try to find URLs that end with vercel.app or vercel.com (most common)
    // Match: https://something.vercel.app (stop at whitespace, newline, or punctuation)
    let urlMatch = fullOutput.match(/https?:\/\/[a-z0-9-]+\.vercel\.(app|com)(?=[\s\n\r\)\]\}\"\'\,\.]|$)/i);
    
    if (!urlMatch) {
      // Fallback: try matching with optional path
      urlMatch = fullOutput.match(/https?:\/\/[a-z0-9-]+\.vercel\.(app|com)(?:\/[^\s\n\r\)\]\}\"\'\,]*)?/i);
    }
    
    let deployedUrl: string | undefined;

    if (urlMatch && urlMatch[0]) {
      deployedUrl = urlMatch[0].trim();
      
      // Ensure it starts with http/https
      if (!deployedUrl.startsWith("http")) {
        deployedUrl = `https://${deployedUrl}`;
      }
      
      // Remove trailing slash
      deployedUrl = deployedUrl.replace(/\/$/, "");
      
      // Final validation - ensure it ends with vercel.app or vercel.com (no extra text)
      if (!deployedUrl.match(/\.vercel\.(app|com)$/i)) {
        // Extract just the domain part if there's extra text
        const cleanMatch = deployedUrl.match(/https?:\/\/[a-z0-9-]+\.vercel\.(app|com)/i);
        if (cleanMatch) {
          deployedUrl = cleanMatch[0];
        }
      }
    }

    if (!deployedUrl) {
      // Check if there's an error message about credentials
      const fullOutput = (stdout + stderr).toLowerCase();
      if (fullOutput.includes("no credentials") || fullOutput.includes("authentication") || fullOutput.includes("token")) {
        throw new Error("Vercel authentication failed. Please check your VERCEL_TOKEN environment variable.");
      }
      throw new Error(`Could not parse deployment URL from Vercel output. Output: ${(stdout + stderr).substring(0, 500)}`);
    }

    console.log(`[vercel-deployer] ✓ Deployed to ${deployedUrl}`);
    console.log(`[vercel-deployer] CLI Output:`, stdout.substring(0, 500));

    return {
      success: true,
      deployedUrl
    };
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorOutput = err?.stderr || err?.stdout || "";
    const fullError = err?.message || String(err);
    
    console.error(`[vercel-deployer] Deployment failed:`, errorMessage);
    console.error(`[vercel-deployer] Full error:`, fullError);
    if (errorOutput) {
      console.error(`[vercel-deployer] Error output:`, errorOutput.substring(0, 1000));
    }

    // Try to extract more details from the error
    let detailedError = errorMessage;
    if (errorOutput) {
      detailedError += `\n\nOutput: ${errorOutput.substring(0, 500)}`;
    }
    if (fullError && fullError !== errorMessage) {
      detailedError += `\n\nDetails: ${fullError.substring(0, 500)}`;
    }

    return {
      success: false,
      error: detailedError
    };
  }
}