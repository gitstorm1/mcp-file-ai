import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs/promises";
import path from "path";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// 1. Setup Latest Gemini (Gemini 3 Flash is the 2026 default for speed/intelligence)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

const server = new McpServer({
    name: "mcp-file-ai",
    version: "2.0.0",
});

const SANDBOX_DIR = path.resolve(process.cwd(), "sandbox");

// 2. The Modern "registerTool" Pattern
server.registerTool(
    "generate_structure",
    {
        description: "Create new files and folders. Note: This will overwrite existing files with the same name. It is recommended to check the directory structure first if unsure.",
        inputSchema: z.object({
            prompt: z.string().describe("The structure to build (e.g., 'A simple React app structure')"),
        })
    },
    async ({ prompt }) => {
        const systemInstruction = `
            You are a file system generator. Generate valid JSON only. 
            Folders are objects, files are strings containing code. 
            Do not include any text outside of the JSON object.
        `;

        try {
            const result = await model.generateContent([systemInstruction, prompt]);
            const responseText = result.response.text().trim();

            // 3. Robust JSON Cleaning (Strip markdown backticks if present)
            const cleanJson = responseText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
            const structure = JSON.parse(cleanJson);

            // Recursive function to physically create the files
            const writeRecursive = async (base: string, obj: any) => {
                for (const [name, val] of Object.entries(obj)) {
                    const p = path.join(base, name);
                    if (typeof val === "string") {
                        await fs.writeFile(p, val);
                    } else {
                        await fs.mkdir(p, { recursive: true });
                        await writeRecursive(p, val);
                    }
                }
            };

            await fs.mkdir(SANDBOX_DIR, { recursive: true });
            await writeRecursive(SANDBOX_DIR, structure);

            return {
                content: [{ type: "text", text: `🚀 Build complete! Explore your files in: ${SANDBOX_DIR}` }]
            };
        } catch (error: any) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error processing request: ${error.message}` }]
            };
        }
    }
);

server.registerTool(
    "summarize_directory",
    {
        description: "List all files in the sandbox. Use this BEFORE generating new files to avoid naming conflicts or to understand the existing project structure.",
        inputSchema: z.object({
            directoryPath: z.string().optional().describe("Relative path inside the sandbox (e.g., 'src' or 'components')"),
        })
    },
    async ({ directoryPath = "" }) => {
        try {
            // 1. Resolve and prevent path traversal
            const safeRelativePath = path.normalize(directoryPath).replace(/^(\.\.(\/|\\|$))+/, "");
            const fullPath = path.join(SANDBOX_DIR, safeRelativePath);

            // 2. Verify it's still inside the sandbox
            if (!fullPath.startsWith(SANDBOX_DIR)) {
                throw new Error("Access denied: Path is outside the sandbox.");
            }

            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
                const entries = await fs.readdir(fullPath, { withFileTypes: true });

                // 3. Create a more useful summary (Types and Names)
                const summary = entries.map(entry => {
                    const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
                    return `${type} ${entry.name}`;
                }).join("\n");

                return {
                    content: [{ type: "text", text: `Summary of (the following path is relative to the sandbox directory) ${safeRelativePath || "root"}:\n\n${summary}` }]
                };
            } else {
                return {
                    content: [{ type: "text", text: `The path (the following path is relative to the sandbox directory) '${safeRelativePath}' is a file, not a directory.` }]
                };
            }
        } catch (error: any) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error: ${error.message}` }]
            };
        }
    }
);

// 4. Connect using Stdio (Standard for local AI tools)
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((e) => {
    console.error("MCP File AI (v2.0) failed to start:", e);
    process.exit(1);
});