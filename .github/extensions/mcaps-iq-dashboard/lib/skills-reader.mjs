/**
 * Skills Reader — parses .github/skills, prompts, and agents at startup.
 * Builds role-to-skill mapping from Cross-Role Skill Lens tables.
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

/**
 * Parse YAML-style frontmatter from a markdown file.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  }
  return fm;
}

/**
 * Extract skill IDs from "Cross-Role Skill Lens" table in a role-* SKILL.md.
 */
function parseRoleSkillMapping(content) {
  const skills = [];
  const sectionMatch = content.match(/##\s*Cross-Role Skill Lens[\s\S]*?(?=\n##\s|\n#\s|$)/i);
  if (!sectionMatch) {
    // Fallback: look for any table with backtick skill names
    const tableMatch = content.match(/\|[\s\S]*?\|/g);
    if (tableMatch) {
      for (const line of tableMatch) {
        for (const m of line.matchAll(/`([a-z][\w-]+)`/g)) {
          if (!skills.includes(m[1])) skills.push(m[1]);
        }
      }
    }
    return skills;
  }

  for (const m of sectionMatch[0].matchAll(/`([a-z][\w-]+)`/g)) {
    if (!skills.includes(m[1])) skills.push(m[1]);
  }
  return skills;
}

/**
 * Extract description from first paragraph after frontmatter.
 */
function extractDescription(content, fmDescription) {
  if (fmDescription) return fmDescription;
  const afterFm = content.replace(/^---[\s\S]*?---\s*/, '');
  const firstPara = afterFm.match(/^#[^\n]*\n+([^\n#][^\n]+)/m);
  return firstPara ? firstPara[1].trim().slice(0, 200) : '';
}

/**
 * Extract triggers from skill content.
 */
function extractTriggers(content, fmDescription) {
  const triggerMatch = (fmDescription || '').match(/Triggers?:\s*(.+)/i);
  if (triggerMatch) {
    return triggerMatch[1].split(',').map(t => t.trim().replace(/\.$/, '')).filter(Boolean);
  }
  return [];
}

/**
 * Detect dependencies from skill content.
 */
function detectDependencies(content) {
  const deps = [];
  if (/\bcrm\b|msx[:\-_]|dynamics\s*365|OData/i.test(content)) deps.push('CRM');
  if (/\bpbi\b|power\s*bi|DAX|powerbi/i.test(content)) deps.push('PBI');
  if (/\bm365\b|teams|calendar|mail|outlook|workiq/i.test(content)) deps.push('M365');
  if (/\bvault\b|\boil\b|obsidian/i.test(content)) deps.push('Vault');
  return deps;
}

/**
 * Read all skills from .github/skills/
 */
export async function readSkills(repoRoot) {
  const skillsDir = join(repoRoot, '.github', 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    try {
      const content = await readFile(skillPath, 'utf8');
      const fm = parseFrontmatter(content);
      skills.push({
        id: entry.name,
        name: fm.name || entry.name,
        description: extractDescription(content, fm.description),
        triggers: extractTriggers(content, fm.description),
        dependencies: detectDependencies(content),
        path: `.github/skills/${entry.name}/SKILL.md`,
        type: 'skill'
      });
    } catch { /* skip unreadable files */ }
  }

  return skills;
}

/**
 * Read all prompts from .github/prompts/
 */
export async function readPrompts(repoRoot) {
  const promptsDir = join(repoRoot, '.github', 'prompts');
  if (!existsSync(promptsDir)) return [];

  const files = await readdir(promptsDir);
  const prompts = [];

  for (const file of files) {
    if (!file.endsWith('.prompt.md')) continue;
    try {
      const content = await readFile(join(promptsDir, file), 'utf8');
      const fm = parseFrontmatter(content);
      prompts.push({
        id: file.replace('.prompt.md', ''),
        name: fm.name || file.replace('.prompt.md', ''),
        description: extractDescription(content, fm.description),
        path: `.github/prompts/${file}`,
        type: 'prompt'
      });
    } catch { /* skip */ }
  }

  return prompts;
}

/**
 * Read all agents from .github/agents/
 */
export async function readAgents(repoRoot) {
  const agentsDir = join(repoRoot, '.github', 'agents');
  if (!existsSync(agentsDir)) return [];

  const files = await readdir(agentsDir);
  const agents = [];

  for (const file of files) {
    if (!file.endsWith('.agent.md')) continue;
    try {
      const content = await readFile(join(agentsDir, file), 'utf8');
      const fm = parseFrontmatter(content);

      // Parse tools list
      const toolsMatch = content.match(/^tools:\s*\n((?:\s+-\s*.+\n?)*)/m);
      const tools = toolsMatch
        ? toolsMatch[1].match(/-\s*["']?([^"'\n]+)["']?/g)?.map(t => t.replace(/^-\s*["']?|["']?$/g, '').trim()) || []
        : [];

      // Parse sub-agents
      const agentsMatch = content.match(/^agents:\s*\[(.*?)\]/m);
      const subAgents = agentsMatch
        ? agentsMatch[1].split(',').map(a => a.trim()).filter(Boolean)
        : [];

      agents.push({
        id: file.replace('.agent.md', ''),
        name: fm.name || file.replace('.agent.md', ''),
        description: fm.description || extractDescription(content, null),
        tools,
        subAgents,
        path: `.github/agents/${file}`,
        type: 'agent'
      });
    } catch { /* skip */ }
  }

  return agents;
}

/**
 * Build role-to-skill mapping from role-* SKILL.md files.
 */
export async function buildRoleMapping(repoRoot) {
  const skillsDir = join(repoRoot, '.github', 'skills');
  const ROLE_IDS = ['role-ae', 'role-specialist', 'role-se', 'role-csa', 'role-csam', 'role-ats', 'role-ia', 'role-atu-sd'];
  const ROLE_LABELS = {
    'role-ae': 'Account Executive (AE)',
    'role-specialist': 'Specialist',
    'role-se': 'Solution Engineer (SE)',
    'role-csa': 'Cloud Solution Architect (CSA)',
    'role-csam': 'Customer Success Account Manager (CSAM)',
    'role-ats': 'Account Technology Strategist (ATS)',
    'role-ia': 'Industry Advisor (IA)',
    'role-atu-sd': 'ATU Sales Director (SD)'
  };
  const ROLE_STAGES = {
    'role-ae': 'S1 Lead, S2 Co-Lead, S5 Co-Lead',
    'role-specialist': 'S2-S3 Lead',
    'role-se': 'S3 Lead',
    'role-csa': 'S4-S5 Lead',
    'role-csam': 'S4-S5 Lead',
    'role-ats': 'S1-S2 Lead, S5 Lead',
    'role-ia': 'S1 Lead',
    'role-atu-sd': 'S1-S5 Govern'
  };

  const mapping = {};

  for (const roleId of ROLE_IDS) {
    const skillPath = join(skillsDir, roleId, 'SKILL.md');
    let skills = [];
    let description = '';

    if (existsSync(skillPath)) {
      try {
        const content = await readFile(skillPath, 'utf8');
        skills = parseRoleSkillMapping(content);
        const fm = parseFrontmatter(content);
        description = fm.description || '';
      } catch { /* fallback to empty */ }
    }

    const shortId = roleId.replace('role-', '');
    mapping[shortId] = {
      id: shortId,
      roleId,
      label: ROLE_LABELS[roleId] || shortId,
      stages: ROLE_STAGES[roleId] || '',
      description,
      skills
    };
  }

  return mapping;
}

/**
 * Read all repo capabilities in one call.
 */
export async function readAllCapabilities(repoRoot) {
  const [skills, prompts, agents, roleMapping] = await Promise.all([
    readSkills(repoRoot),
    readPrompts(repoRoot),
    readAgents(repoRoot),
    buildRoleMapping(repoRoot)
  ]);

  return { skills, prompts, agents, roleMapping };
}
