import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "..", "sandbox");

// Ensure sandbox directory exists
try {
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
} catch (err) {
    console.error("Failed to create sandbox directory:", err);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

const server = new Server(
    {
        name: "mcp-file-ai",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Validates that a path is within the sandbox and returns the absolute path.
 */
async function getSafePath(relativePath: string): Promise<string> {
    const absolutePath = path.resolve(SANDBOX_DIR, relativePath);
    if (!absolutePath.startsWith(SANDBOX_DIR)) {
        throw new Error("Path is outside of sandbox");
    }
    return absolutePath;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "generate_files",
                description: "Generate files and folders based on a natural language description using Gemini.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "Description of the file structure or code to generate.",
                        },
                    },
                    required: ["prompt"],
                },
            },
            {
                name: "list_sandbox",
                description: "List the contents of the sandbox directory.",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Optional relative path within sandbox to list.",
                        },
                    },
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "generate_files") {
            const { prompt } = z.object({ prompt: z.string() }).parse(args);

            const systemInstruction = `
        You are a file system generator. Based on the user's prompt, generate a JSON representation of files and folders.
        The output must be a valid JSON object where keys are file or folder names.
        If a key represents a folder, its value should be another object.
        If a key represents a file, its value should be a string containing the file content.
        
        Example:
        {
          "src": {
            "index.js": "console.log('hello');",
            "utils": {
              "math.js": "export const add = (a, b) => a + b;"
            }
          },
          "package.json": "{ \"name\": \"my-app\" }"
        }
        
        ONLY return the JSON object. No markdown formatting.
      `;

            const result = await model.generateContent([systemInstruction, prompt]);
            const responseText = result.response.text().trim();

            // Basic cleaning in case the model adds markdown code blocks
            const jsonStr = responseText.replace(/^```json\n?/, "").replace(/n?```$/, "");
            const structure = JSON.parse(jsonStr);

            async function applyStructure(currentPath: string, obj: any) {
                for (const [key, value] of Object.entries(obj)) {
                    const targetPath = path.join(currentPath, key);
                    if (typeof value === "string") {
                        await fs.writeFile(targetPath, value);
                    } else if (typeof value === "object") {
                        await fs.mkdir(targetPath, { recursive: true });
                        await applyStructure(targetPath, value);
                    }
                }
            }

            await applyStructure(SANDBOX_DIR, structure);

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully generated files in sandbox based on prompt: "${prompt}"`,
                    },
                ],
            };
        }

        if (name === "list_sandbox") {
            const { path: relPath = "." } = z.object({ path: z.string().optional() }).parse(args || {});
            const safePath = await getSafePath(relPath);

            const files = await fs.readdir(safePath, { withFileTypes: true });
            const list = files.map(f => `${f.isDirectory() ? "[DIR] " : "[FILE]"} ${f.name}`).join("\n");

            return {
                content: [
                    {
                        type: "text",
                        text: list || "Sandbox is empty.",
                    },
                ],
            };
        }

        throw new Error(`Unknown tool: ${name}`);
    } catch (error: any) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Error: ${error.message}`,
                },
            ],
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP File AI server running on stdio");
