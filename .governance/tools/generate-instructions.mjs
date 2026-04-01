#!/usr/bin/env node
import path from 'node:path';
import { writeFileSafe, templateCopilot, templateAgents, templateClaude, templateCursorMdc, templateContinueRule } from './common.mjs';

const root = process.cwd();
writeFileSafe(path.join(root, '.github', 'copilot-instructions.md'), templateCopilot());
writeFileSafe(path.join(root, 'AGENTS.md'), templateAgents());
writeFileSafe(path.join(root, 'CLAUDE.md'), templateClaude());
writeFileSafe(path.join(root, '.cursor', 'rules', '00-governance.mdc'), templateCursorMdc());
writeFileSafe(path.join(root, '.continue', 'rules', '00-governance.md'), templateContinueRule());
console.log('Generated AI instruction files.');
