import * as readline from "node:readline";
import { stdin, stdout } from "node:process";

const rl = readline.createInterface({ input: stdin, output: stdout });

const serverInfo = {
  name: "Realtor",
  version: "1.0.0",
};

const estates = [
  {
    name: "Ruul",
    price: 22.0,
    description: "A house with a garden",
  },
  {
    name: "Cool",
    price: 23.0,
    description: "A house with a swimming pool",
  },
  {
    name: "Kuul",
    price: 27.0,
    description: "A two storey house",
  },
];

const resources = [
  {
    uri: "estates://app",
    name: "estates",
    async get() {
      return {
        contents: [
          {
            uri: "estates://app",
            text: JSON.stringify(estates),
          },
        ],
      };
    },
  },
];

const tools = [
  {
    name: "getEstates",
    description:
      "Use this to retrieve a list of all available estates, this only includes their names. Useful when the user hasn't specified a name or wants to browse available options. ",
    inputSchema: { type: "object", properties: {} },
    async handle(_args: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              names: estates.map((estate) => estate.name),
            }),
          },
        ],
      };
    },
  },
  {
    name: "getEstatInfo",
    description: `Use this to retrieve all available information about a specific estate, including its name, description, price. Further information about the estate is in the description. Use this whenever the user asks any question about a specific estate. The name parameter should match the name of an estate exactly. You must extract just the estate's name from the user's input, ignoring surrounding context or extra words. Examples: If the user asks: "Does the estate Sunset Villa have a garage?" — extract "Sunset Villa". If the user asks: "Is the estate, kuul having a storey?" — extract "kuul", not "kuul having a storey"`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
      required: ["name"],
    },
    async handle(args: { name: string }) {
      const estate = estates.find(
        (e) => e.name.toLowerCase() === args.name.toLowerCase()
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(estate || { error: "Estate not found" }),
          },
        ],
      };
    },
  },
];

function sendResponse(id: number, result: object) {
  const response = {
    result,
    jsonrpc: "2.0",
    id,
  };
  console.log(JSON.stringify(response));
}

(async function main() {
  for await (const line of rl) {
    try {
      const json = JSON.parse(line);
      if (json.jsonrpc === "2.0") {
        if (json.method === "initialize") {
          sendResponse(json.id, {
            protocolVersion: "2025-03-26",
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true },
            },
            serverInfo,
          });
        }
        if (json.method === "tools/list") {
          sendResponse(json.id, {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          });
        }
        if (json.method === "tools/call") {
          const tool = tools.find((t) => t.name === json.params.name);

          if (tool) {
            const toolResponse = await tool.handle(json.params.arguments);

            sendResponse(json.id, toolResponse);
          } else {
            sendResponse(json.id, {
              error: {
                code: -32602,
                message: `MCP tool call error -32602: Tool ${json.params.name} not found`,
              },
            });
          }
        }

        if (json.method === "resources/list") {
          sendResponse(json.id, {
            resources: resources.map((r) => ({
              uri: r.uri,
              name: r.name,
            })),
          });
        }

        if (json.method === "resources/read") {
          const resource = resources.find((r) => r.uri === json.params.uri);

          if (resource) {
            sendResponse(json.id, await resource.get());
          } else {
            sendResponse(json.id, {
              error: { code: -32602, message: "Resource not found" },
            });
          }
        }

        if (json.method === "ping") {
          sendResponse(json.id, {});
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
})();
