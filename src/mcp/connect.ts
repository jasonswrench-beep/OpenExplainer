// The lines an AI assistant needs to connect to OpenExplainer over MCP: the program to start, and `--mcp` to say it should run with no window and talk over standard input and output.

/** The two ways to give an assistant the command, for the program at `exe`. The path is written safely, so a folder name with spaces or backslashes works. */
export function connectionLines(exe: string): { desktop: string; code: string } {
  return {
    desktop: JSON.stringify({ mcpServers: { openexplainer: { command: exe, args: ["--mcp"] } } }, null, 2),
    code: `claude mcp add openexplainer -- ${JSON.stringify(exe)} --mcp`,
  };
}
