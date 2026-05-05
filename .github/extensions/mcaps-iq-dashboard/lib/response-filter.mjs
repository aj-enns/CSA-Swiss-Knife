/**
 * Response Filter — strips code blocks, JSON, SQL, and tool-call refs
 * from assistant responses for cleaner dashboard display.
 */

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]{40,}`/g;
const TOOL_REF_RE = /\b(?:tool|function)_call_id[:\s]+\S+/gi;
const JSON_BLOB_RE = /\{[\s\S]{200,}?\}/g;

export function filterResponse(rawContent, options = {}) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { filtered: rawContent || '', hadCode: false, hadToolRefs: false };
  }

  const { showCode = false, verbosity = 'normal' } = options;
  let filtered = rawContent;
  let hadCode = false;
  let hadToolRefs = false;

  if (!showCode) {
    if (CODE_BLOCK_RE.test(filtered)) hadCode = true;
    filtered = filtered.replace(CODE_BLOCK_RE, '\n`[code block hidden]`\n');
    filtered = filtered.replace(INLINE_CODE_RE, '`[...]`');
  }

  if (TOOL_REF_RE.test(filtered)) hadToolRefs = true;
  filtered = filtered.replace(TOOL_REF_RE, '');

  if (verbosity === 'minimal') {
    filtered = filtered.replace(JSON_BLOB_RE, '`[JSON hidden]`');
  }

  filtered = filtered.replace(/\n{3,}/g, '\n\n').trim();

  return { filtered, hadCode, hadToolRefs };
}
