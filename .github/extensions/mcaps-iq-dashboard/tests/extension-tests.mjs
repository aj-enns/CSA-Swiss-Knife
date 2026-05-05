/**
 * MCAPS IQ Dashboard — Smoke tests
 * Verifies skills-reader, settings, and server basics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSkills, readPrompts, readAgents, buildRoleMapping, readAllCapabilities } from '../lib/skills-reader.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

describe('skills-reader', () => {
  it('reads all skills from .github/skills/', async () => {
    const skills = await readSkills(REPO_ROOT);
    assert.ok(skills.length >= 40, `Expected ≥40 skills, got ${skills.length}`);
    
    // Every skill should have an id and name
    for (const skill of skills) {
      assert.ok(skill.id, `Skill missing id: ${JSON.stringify(skill)}`);
      assert.ok(skill.name, `Skill missing name: ${skill.id}`);
      assert.ok(skill.path, `Skill missing path: ${skill.id}`);
      assert.equal(skill.type, 'skill');
    }
  });

  it('reads all prompts from .github/prompts/', async () => {
    const prompts = await readPrompts(REPO_ROOT);
    assert.ok(prompts.length >= 20, `Expected ≥20 prompts, got ${prompts.length}`);
    
    for (const prompt of prompts) {
      assert.ok(prompt.id, `Prompt missing id`);
      assert.equal(prompt.type, 'prompt');
    }
  });

  it('reads all agents from .github/agents/', async () => {
    const agents = await readAgents(REPO_ROOT);
    assert.ok(agents.length >= 3, `Expected ≥3 agents, got ${agents.length}`);
    
    const agentNames = agents.map(a => a.name || a.id);
    assert.ok(agentNames.some(n => n.includes('mcaps')), 'Expected mcaps agent');
  });

  it('builds role mapping from role-* SKILL.md files', async () => {
    const mapping = await buildRoleMapping(REPO_ROOT);
    
    // Should have all 8 roles
    const expectedRoles = ['ae', 'specialist', 'se', 'csa', 'csam', 'ats', 'ia', 'atu-sd'];
    for (const role of expectedRoles) {
      assert.ok(mapping[role], `Missing role: ${role}`);
      assert.ok(mapping[role].label, `Role ${role} missing label`);
      assert.ok(mapping[role].stages, `Role ${role} missing stages`);
    }
    
    // Specialist and SE should have skills mapped
    const specialistSkills = mapping['specialist']?.skills || [];
    assert.ok(specialistSkills.length > 0, `Specialist should have mapped skills, got ${specialistSkills.length}`);
    
    const seSkills = mapping['se']?.skills || [];
    assert.ok(seSkills.length > 0, `SE should have mapped skills, got ${seSkills.length}`);
  });

  it('readAllCapabilities returns complete data', async () => {
    const caps = await readAllCapabilities(REPO_ROOT);
    
    assert.ok(caps.skills.length > 0, 'No skills');
    assert.ok(caps.prompts.length > 0, 'No prompts');
    assert.ok(caps.agents.length > 0, 'No agents');
    assert.ok(Object.keys(caps.roleMapping).length === 8, 'Not all 8 roles mapped');
  });
});

describe('response-filter', () => {
  it('strips code blocks when showCode is false', async () => {
    const { filterResponse } = await import('../lib/response-filter.mjs');
    
    const input = 'Hello\n```js\nconst x = 1;\n```\nWorld';
    const { filtered, hadCode } = filterResponse(input, { showCode: false });
    
    assert.ok(hadCode, 'Should detect code blocks');
    assert.ok(!filtered.includes('const x = 1'), 'Should strip code block content');
    assert.ok(filtered.includes('[code block hidden]'), 'Should show placeholder');
  });

  it('preserves code blocks when showCode is true', async () => {
    const { filterResponse } = await import('../lib/response-filter.mjs');
    
    const input = 'Hello\n```js\nconst x = 1;\n```\nWorld';
    const { filtered } = filterResponse(input, { showCode: true });
    
    assert.ok(filtered.includes('const x = 1'), 'Should preserve code');
  });
});

describe('tool-event-detail', () => {
  it('extracts detail from tool arguments', async () => {
    const { deriveToolDetail } = await import('../lib/tool-event-detail.mjs');
    
    assert.equal(deriveToolDetail('grep', { pattern: 'TODO' }), '/TODO/');
    assert.ok(deriveToolDetail('view', { path: 'C:\\Users\\test\\src\\file.js' }).includes('file.js'));
    assert.equal(deriveToolDetail('sql', { description: 'Query todos' }), 'Query todos');
    assert.equal(deriveToolDetail('msx-crm_whoami', {}), 'crm_whoami');
  });
});
