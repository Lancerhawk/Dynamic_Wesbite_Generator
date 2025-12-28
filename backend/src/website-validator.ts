import fs from "fs";
import path from "path";
import { getAnthropicClient, getDefaultModel, ModelProvider } from "./anthropic-client";

export interface ValidationIssue {
  fileName: string;
  issue: string;
  severity: "error" | "warning";
  fix: string;
}

export interface ValidationResult {
  hasIssues: boolean;
  issues: ValidationIssue[];
  fixedFiles: string[];
}

export async function validateAndFixWebsite(
  projectDir: string,
  generatedFiles: Array<{ fileName: string; purpose: string }>,
  provider: ModelProvider = "openrouter"
): Promise<ValidationResult> {
  console.log(`[website-validator] Validating ${generatedFiles.length} files...`);

  const fileContents: Record<string, string> = {};
  for (const file of generatedFiles) {
    const filePath = path.join(projectDir, file.fileName);
    if (fs.existsSync(filePath)) {
      fileContents[file.fileName] = fs.readFileSync(filePath, "utf-8");
    }
  }

  const client = getAnthropicClient(provider);
  const model = getDefaultModel(provider);
  
  const fileList = generatedFiles
    .map((f) => {
      const content = fileContents[f.fileName] || "(file not found)";
      return `\n=== ${f.fileName} ===\n${content}`;
    })
    .join("\n\n");
  
  const validationPrompt = `You are a code validator for a static website generator.
Review the following generated files and identify any issues.

CRITICAL ISSUES TO CHECK:
1. Markdown code fences (backticks with language names) - these must be removed
2. Syntax errors (missing brackets, quotes, etc.)
3. Missing critical functionality (data loading, rendering, etc.)
4. Broken references (missing IDs, wrong file paths, etc.)
5. Invalid HTML/CSS/JS structure
6. Navigation links to non-existent pages - navbar should ONLY link to pages that actually exist
7. Card alignment issues - cards must use proper grid layout with equal heights and proper spacing
8. Layout breaking - cards overflowing or not aligned properly in grid

Return ONLY a JSON array of issues in this format:
[
  {
    "fileName": "app.js",
    "issue": "File wrapped in markdown code fences",
    "severity": "error",
    "fix": "Remove the opening backticks and closing backticks, keep only the pure code"
  }
]

If no issues found, return an empty array: [].

Files to validate:${fileList}

Return ONLY the JSON array, no markdown, no explanation.`;

  try {
    const msg = await client.messages.create({
      model: model,
      max_tokens: provider === "openrouter" ? 1500 : 2000,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: validationPrompt
            }
          ]
        }
      ]
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    
    let jsonText = text.trim();
    if (jsonText.includes("```")) {
      const match = jsonText.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
      if (match) {
        jsonText = match[1];
      }
    }

    const issues: ValidationIssue[] = JSON.parse(jsonText);

    if (!Array.isArray(issues)) {
      throw new Error("Invalid validation response format");
    }

    console.log(`[website-validator] Found ${issues.length} issues`);

    const fixedFiles: string[] = [];

    for (const issue of issues) {
      if (issue.severity === "error") {
        console.log(`[website-validator] Fixing error in "${issue.fileName}": ${issue.issue}`);
        
        const fileInfo = generatedFiles.find((f) => f.fileName === issue.fileName);
        if (!fileInfo) continue;

        const currentContent = fileContents[issue.fileName];
        const isTruncated = issue.issue.toLowerCase().includes("truncated") || 
                           issue.issue.toLowerCase().includes("incomplete") ||
                           issue.issue.toLowerCase().includes("cut off");
        
        const fixPrompt = `The file "${issue.fileName}" has an issue: ${issue.issue}

Fix instruction: ${issue.fix}

${isTruncated ? "CRITICAL: The file is TRUNCATED/INCOMPLETE. You MUST complete the entire file from start to finish. Do NOT just append to the existing content - regenerate the COMPLETE file." : ""}

Current file content (may be incomplete):
\`\`\`
${currentContent}
\`\`\`

${isTruncated ? "IMPORTANT: Return the COMPLETE, FULL file content. Ensure all HTML tags are properly closed, all attributes are complete, and the file ends properly (e.g., </html> tag)." : ""}

Return ONLY the corrected COMPLETE file content with NO markdown wrappers, NO code fences, NO explanations.
Just the pure code that should be saved directly to the file.`;

        const fixMsg = await client.messages.create({
          model: model,
          max_tokens: provider === "openrouter" ? 3000 : 4000,
          temperature: 0.3,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: fixPrompt
                }
              ]
            }
          ]
        });

        const fixedCode = fixMsg.content[0]?.type === "text" ? fixMsg.content[0].text : "";
        
        let cleanCode = fixedCode.trim();
        if (cleanCode.includes("```")) {
          cleanCode = cleanCode.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();
        }

        if (issue.fileName.endsWith(".html")) {
          const openHtml = (cleanCode.match(/<html/gi) || []).length;
          const closeHtml = (cleanCode.match(/<\/html>/gi) || []).length;
          const openBody = (cleanCode.match(/<body/gi) || []).length;
          const closeBody = (cleanCode.match(/<\/body>/gi) || []).length;
          
          if (openHtml !== closeHtml || openBody !== closeBody) {
            console.warn(`[website-validator] ⚠ Fixed "${issue.fileName}" may still be incomplete (HTML tags mismatch)`);
          }
          
          if (!cleanCode.trim().endsWith("</html>") && !cleanCode.trim().endsWith("</body>")) {
            console.warn(`[website-validator] ⚠ Fixed "${issue.fileName}" may be truncated (doesn't end with </html> or </body>)`);
          }
        }

        const filePath = path.join(projectDir, issue.fileName);
        fs.writeFileSync(filePath, cleanCode, "utf-8");
        fixedFiles.push(issue.fileName);

        console.log(`[website-validator] ✓ Fixed "${issue.fileName}" (${cleanCode.length} chars)`);
      }
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      fixedFiles
    };
  } catch (err) {
    console.error(`[website-validator] Validation failed:`, err);
    return {
      hasIssues: false,
      issues: [],
      fixedFiles: []
    };
  }
}

