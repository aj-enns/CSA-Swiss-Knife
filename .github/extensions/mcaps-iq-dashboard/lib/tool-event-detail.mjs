/**
 * Tool Event Detail — extracts human-readable summaries from tool call arguments.
 */

export function parseToolArguments(args) {
  if (!args) return {};
  if (typeof args === 'string') {
    try { return JSON.parse(args); } catch { return {}; }
  }
  return args;
}

export function deriveToolDetail(toolName, rawArgs) {
  const args = parseToolArguments(rawArgs);
  if (!toolName) return '';

  // File operations
  if (toolName === 'view' || toolName === 'read') {
    return args.path ? shortPath(args.path) : '';
  }
  if (toolName === 'edit' || toolName === 'create') {
    return args.path ? shortPath(args.path) : '';
  }

  // Search
  if (toolName === 'grep') {
    return args.pattern ? `/${args.pattern}/` : '';
  }
  if (toolName === 'glob') {
    return args.pattern || '';
  }

  // Shell
  if (toolName === 'powershell' || toolName === 'bash') {
    const cmd = args.command || '';
    return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd;
  }

  // Task/agent
  if (toolName === 'task') {
    return args.description || args.prompt?.slice(0, 60) || '';
  }

  // SQL
  if (toolName === 'sql') {
    return args.description || '';
  }

  // CRM tools
  if (toolName.startsWith('msx-')) {
    const method = toolName.replace('msx-', '');
    if (args.customerKeyword) return `${method}: ${args.customerKeyword}`;
    if (args.opportunityKeyword) return `${method}: ${args.opportunityKeyword}`;
    return method;
  }

  // Web
  if (toolName === 'web_fetch' || toolName === 'web_search') {
    return args.url || args.query || '';
  }

  return '';
}

function shortPath(fullPath) {
  if (!fullPath) return '';
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : fullPath;
}
