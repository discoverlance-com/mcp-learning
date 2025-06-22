# MCP From Scratch

This codebase has the MCP client and MCP server. Make sure to first build the server before you start the client because the client uses the server to perform actions.

The MCP server is a realtor that provides real estates (fake) information as tools and resources to MCP clients.

You can directly use the client to interact with the server by getting estate or resources details or using the, "Ask the AI" option to rather send a question to the AI who will then use the tool to answer the question.

The MCP client also uses GEMINI AI as the AI Model. You can update this to any other model. Of course, each model seems to approach the way they handle tools differently so you can either refer to a unified tool like [Vercel AI SDK](https://vercel.com/docs/ai-sdk) or [Jack Herrington's DIY Github Code](https://github.com/jherr/diy-mcp) which uses Anthropic for the AI to see a different implementation of tools communication. The general concept remains the same, you provide the tools to the AI and they will use it when required. You can also use the system prompt (and the tool descriptions) to refine the AI's tool usage like as done in the client code (`callAI` function).

## Prerequisites

- Node
- Gemini API

## Get Started

- Build the server code

```bash

cd server
npm run build

```

- Change directory to the client folder, `cd client`
- Set your GEMINI API KEY. The method can differ depending on your platform, on linux you can just use `export GEMINI_API_KEY="<put-the-key-here>"`. On windows, when using powershell, you can run the command, `$env:GEMINI_API_KEY="<put-the-key-here>"`. You can check your platform specific information for how to set the environment variable in the command line you are using.
- Run the Client. In the same terminal where you set the environment variable, run either of the following

```bash
# this might ask you to install tsx so you can go ahead to type y to accept and it will run the code
npm run start

## OR

# if you don't want to use tsx, you can also just simply run
npm run build && node dist/index.js

```
