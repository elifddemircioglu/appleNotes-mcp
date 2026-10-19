# appleNotes-mcp

Mcp server to use apple-notes in claude cli and desktop app

To use in claude cli:
claude mcp add apple-notes --scope user -- /pathToYour/node/v24.11.0/bin/node /pathToYour/dist/index.js

To use in claude desktop:

In the Claude desktop app, open Settings → Developer → Edit Config.
That opens ~/Library/Application Support/Claude/claude_desktop_config.json.
Add:
"mcpServers": {
"apple-notes": {
"command": "/pathToYour/node/v24.11.0/bin/node",
"args": ["/pathToYour/dist/index.js"]
}
}
