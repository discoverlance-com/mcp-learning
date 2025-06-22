import { spawn } from "node:child_process";
import * as readline from "node:readline";

import { intro, isCancel, select, text } from "@clack/prompts";
import chalk from "chalk";

type Tool = {
  name: string;
  description: string;
  inputSchema: {
    properties: Record<string, any>;
  };
};

type Resource = {
  uri: string;
  name: string;
};

type Content = {
  text: string;
};

type AIMessage = {
  role?: "user" | "model";
  parts: {
    text?: string;
    thought?: boolean;
    functionCall?: { name: string; args: object; id?: string };
    functionResponse?: { id?: string; name: string; response: object };
  }[];
};

type AITool = {
  functionDeclarations: [
    {
      name: string;
      description: string;
      parameters: Tool["inputSchema"];
    }
  ];
};

type Candidate = {
  content: AIMessage;
  tokenCount: number;
};

async function callAI(messages: AIMessage[], tools: AITool[] = []) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: messages,
        tools,
        generationConfig: {
          maxOutputTokens: 2048,
        },
        systemInstruction: {
          parts: [
            {
              text: `You are a friendly, helpful AI assistant that helps users find information about real estate. You must use the provided tools to answer questions about estates.

              Always speak naturally and conversationally, as if you're chatting with the user. Avoid quoting raw field names like "description" or "price" unless the user asks for specific data.

              If an estate's data does not explicitly mention something (like a garden), let the user know gently. For example, say: "It doesn't look like this estate has a garden," or "There's no mention of a garden, so it may not include one."

              Respond in a warm, human tone. Don't say things like “the description says...” — instead, paraphrase naturally.

              When calling tools that require estate names, extract only the estate name from the user's sentence. Be careful not to include surrounding context (e.g., “having a storey”) in the name.

              If a user asks about something that isn't mentioned in the data, don't just say “not mentioned”—gently explain that it's probably not available, unless the user wants to confirm.
              Always aim to help the user make a decision, not just state facts.

              Your job is not just to return data, but to help the user make informed decisions with friendly, natural guidance. 
              Example 1:
              User: Does the Ocean View estate have a garden?
              Assistant (internal reasoning): The user is asking about a specific estate. I need to get its details.
              [Calls getEstateInfo with name: "Ocean View"]
              Assistant: I checked the estate's details. It does have a garden.

              Example 2:
              User:
              Does the Rosewood Villa estate have a garden?

              Assistant (ideal tone):
              Let me check that for you.
              Okay, the Rosewood Villa has a large backyard with a swimming pool, but there's no mention of a garden—so it likely doesn't have one.
              `,
            },
          ],
        } as AIMessage,
      }),
    }
  );

  const data = await response.json();
  return data.candidates as Candidate[];
}

(async function main() {
  const serverProcess = spawn("node", ["../server/dist/index.js"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const rl = readline.createInterface({
    input: serverProcess.stdout,
    output: undefined,
  });

  let lastId = 0;

  function askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  }

  async function send(
    method: string,
    params: object = {},
    isNotification?: boolean
  ) {
    serverProcess.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: isNotification ? undefined : lastId++,
      }) + "\n"
    );

    if (isNotification) {
      return;
    }

    const answer = await askQuestion("");
    return JSON.parse(answer).result;
  }

  const {
    serverInfo,
    capabilities,
  }: {
    serverInfo: { name: string; version: string };
    capabilities: {
      tools?: any;
      resources?: any;
    };
  } = await send("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "realtor-client", version: "1.0.0" },
  });

  await send("notifications/initialized", {}, true);

  const tools: Tool[] = capabilities.tools
    ? (await send("tools/list", { _meta: { progressToken: 1 } })).tools
    : [];

  const resources: Resource[] = capabilities.resources
    ? (await send("resources/list", { _meta: { progressToken: 1 } })).resources
    : [];

  intro(`Connected to ${serverInfo.name} v${serverInfo.version}`);

  function dumpContent(content: { text: string }[]) {
    for (const line of content) {
      try {
        console.log(JSON.parse(line.text));
      } catch (e) {
        console.log(line.text);
      }
    }
  }

  async function callAIWithTools(messages: AIMessage[]) {
    const result = await callAI(
      messages,
      tools.map((tool) => ({
        functionDeclarations: [
          {
            description: tool.description,
            name: tool.name,
            parameters: tool?.inputSchema,
          },
        ],
      }))
    );
    return result;
  }

  while (true) {
    const options = [{ value: "ai", label: "Ask the AI" }];

    if (resources.length) {
      options.unshift({ value: "resource", label: "Get a resource" });
    }

    if (tools.length) {
      options.unshift({ value: "tool", label: "Run a tool" });
    }

    const action = await select({
      message: "What would you like to do?",
      options,
    });

    if (isCancel(action)) {
      process.exit(0);
    }

    if (action === "tool") {
      const tool = await select({
        message: "Select a tool.",
        options: tools.map((t) => ({ value: t, label: t.name })),
      });

      if (isCancel(tool)) {
        process.exit(0);
      }

      const args: Record<string, any> = {};

      for (const key of Object.keys(tool?.inputSchema.properties ?? {}).filter(
        (key) => tool?.inputSchema?.properties?.[key]?.type === "string"
      )) {
        const answer = await text({
          message: `Provide a ${key}:`,
          initialValue: "",
        });
        if (isCancel(answer)) {
          process.exit(0);
        }
        args[key] = answer;
      }

      const { content }: { content: Content[] } = await send("tools/call", {
        name: tool.name,
        arguments: args,
      });

      dumpContent(content);
    }

    if (action === "resource") {
      const resource = await select({
        message: "Select a resource.",
        options: resources.map((r) => ({ value: r, label: r.name })),
      });

      if (isCancel(resource)) {
        process.exit(0);
      }

      const { contents }: { contents: Content[] } = await send(
        "resources/read",
        { uri: resource.uri }
      );

      dumpContent(contents);
    }

    if (action === "ai") {
      const prompt = await text({
        message: "What would you like to ask?",
        defaultValue: "What kinds of drinks do you have?",
      });

      if (isCancel(prompt)) {
        process.exit(0);
      }

      const messages: AIMessage[] = [
        { role: "user", parts: [{ text: prompt }] },
      ];

      const promptResult = await callAIWithTools(messages);
      messages.push({ parts: promptResult[0].content.parts, role: "model" });

      for (const result of promptResult[0].content.parts) {
        if (result.text) {
          console.log(result.text);
        }
      }

      const lastResultParts =
        promptResult[0].content.parts[promptResult.length - 1];

      if (lastResultParts.functionCall) {
        console.log(
          chalk.blueBright(
            `Requesting tool call ${
              lastResultParts.functionCall.name
            } - ${JSON.stringify(lastResultParts.functionCall.args)}`
          )
        );

        const { content }: { content: Content[] } = await send("tools/call", {
          name: lastResultParts.functionCall?.name,
          arguments: lastResultParts.functionCall?.args,
        });

        messages.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: lastResultParts.functionCall?.name!,
                id: lastResultParts.functionCall?.id,
                response: JSON.parse(content[0].text),
              },
            },
          ],
        });

        const followUpResult = await callAIWithTools(messages);

        for (const result of followUpResult[0].content.parts) {
          if (result.text) {
            console.log(result.text);
          }
        }
      }
    }
  }
})();
