# MCP File AI

A basic Model Context Protocol (MCP) tool that uses the Gemini API to create files and folders in a sandboxed directory.

## Prerequisites

- NodeJS v24.x (Latest LTS as of March 2026)
- A Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env`.
   - Add your `GEMINI_API_KEY`.

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

You can run the server in development mode:
```bash
npm run dev
```

Or run the built version:
```bash
npm run start
```

### Integrated Tools

- `generate_files`: Send a natural language prompt (e.g., "Create a simple Python script that prints 'Hello World'") and the tool will use Gemini to generate the file structure and write it to the `sandbox/` directory.
- `list_sandbox`: List the contents currently in the `sandbox/` directory.

## Sandboxing

All file operations are restricted to the `sandbox/` directory relative to the project root. Paths are validated to prevent directory traversal.
