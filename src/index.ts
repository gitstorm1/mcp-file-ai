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
        description: "Generate files and folders based on a natural language description using Gemini 3.",
        inputSchema: {
            prompt: z.string().describe("The structure to build (e.g., 'A simple React app structure')"),
        }
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

// 4. Connect using Stdio (Standard for local AI tools)
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP File AI (v2.0) is active.");
}

main().catch(console.error);