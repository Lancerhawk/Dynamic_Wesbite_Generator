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
      const vercelConfig = {
        version: 2,
        builds: [
          { src: "**/*", use: "@vercel/static" }
        ],
        routes: [
          { src: "/(.*)", dest: "/$1" }
        ]
      };
      fs.writeFileSync(vercelConfigPath, JSON.stringify(vercelConfig, null, 2), "utf-8");
    }

    const sanitizedName = projectName.replace(/[^a-z0-9-]/gi, "-").toLowerCase().substring(0, 50);

    console.log(`[vercel-deployer] Deploying from ${projectDir} using Vercel CLI...`);

    const vercelCommand = `npx --yes vercel deploy --yes --prod --token ${vercelToken}`;
    
    console.log(`[vercel-deployer] Executing: vercel deploy from ${projectDir}...`);

    const { stdout, stderr } = await execAsync(vercelCommand, {
      cwd: projectDir,
      env: {
        ...process.env,
        VERCEL_TOKEN: vercelToken
      },
      maxBuffer: 10 * 1024 * 1024
    });

    const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
    let deployedUrl: string | undefined;

    if (urlMatch) {
      deployedUrl = urlMatch[0];
      if (!deployedUrl.startsWith("http")) {
        deployedUrl = `https://${deployedUrl}`;
      }
    } else {
      const stderrUrlMatch = stderr.match(/https?:\/\/[^\s]+/);
      if (stderrUrlMatch) {
        deployedUrl = stderrUrlMatch[0];
        if (!deployedUrl.startsWith("http")) {
          deployedUrl = `https://${deployedUrl}`;
        }
      }
    }

    if (!deployedUrl) {
      deployedUrl = `https://${sanitizedName}.vercel.app`;
      console.warn(`[vercel-deployer] Could not parse URL from output, using fallback: ${deployedUrl}`);
    }

    console.log(`[vercel-deployer] ✓ Deployed to ${deployedUrl}`);
    console.log(`[vercel-deployer] CLI Output:`, stdout.substring(0, 500));

    return {
      success: true,
      deployedUrl
    };
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorOutput = err.stderr || err.stdout || "";
    
    console.error(`[vercel-deployer] Deployment failed:`, errorMessage);
    if (errorOutput) {
      console.error(`[vercel-deployer] Error output:`, errorOutput.substring(0, 500));
    }

    return {
      success: false,
      error: `${errorMessage}${errorOutput ? `\n${errorOutput.substring(0, 200)}` : ""}`
    };
  }
}