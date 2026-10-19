#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addNote, readNote } from "./notes.js";

const server = new McpServer({ name: "apple-notes", version: "1.0.0" });

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (e: unknown) => ({
  ...text(`Error: ${e instanceof Error ? e.message : String(e)}`),
  isError: true,
});

server.registerTool(
  "add_note",
  {
    title: "Add note",
    description:
      "Create a new note in Apple Notes. The header becomes the note's title; content is plain text (newlines are kept).",
    inputSchema: {
      header: z.string().min(1).describe("Title of the note"),
      content: z.string().default("").describe("Plain-text body of the note"),
      folder: z.string().optional().describe("Folder name; defaults to the default Notes folder"),
    },
  },
  async ({ header, content, folder }) => {
    try {
      const note = await addNote(header, content, folder);
      return text(`Created note "${note.title}" in folder "${note.folder}" (id: ${note.id}).`);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "read_note",
  {
    title: "Read note",
    description:
      "Read a note from Apple Notes by its exact header (title). If no exact match exists, returns notes whose titles contain the header.",
    inputSchema: {
      header: z.string().min(1).describe("Exact title of the note to read"),
    },
  },
  async ({ header }) => {
    try {
      const { found, similar } = await readNote(header);
      if (found.length > 0) {
        return text(
          found
            .map(
              (n) =>
                `# ${n.title}\nFolder: ${n.folder} | Modified: ${n.modified} | id: ${n.id}\n\n${n.text}`,
            )
            .join("\n\n---\n\n"),
        );
      }
      if (similar.length > 0) {
        return text(
          `No note titled "${header}". Similar titles:\n` +
            similar.map((n) => `- ${n.title} (folder: ${n.folder})`).join("\n"),
        );
      }
      return text(`No note titled "${header}" found.`);
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
