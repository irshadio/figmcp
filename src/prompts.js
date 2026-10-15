// Ready-made prompts listed by clients as suggestions.
import { z } from 'zod';

const user = (text) => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });

export function registerPrompts(server) {
  server.registerPrompt('implement_selection', {
    title: 'Turn my design into code',
    description: 'Implement the frame selected in Figma Desktop in the current project.',
  }, () => user(
    'Implement the frame selected in Figma Desktop. Call get_design_context for it, ' +
    'adapt the reference code to this project\'s components, tokens and conventions, ' +
    'and compare the result with the screenshot.'));

  server.registerPrompt('design_screen', {
    title: 'Design a screen',
    description: 'Create a new screen in the open Figma file, reusing its design system.',
    argsSchema: { brief: z.string().describe('What the screen is for and what it should contain.') },
  }, ({ brief }) => user(
    `Design a new screen in the open Figma file: ${brief}\n\n` +
    'Call search_design_system first and reuse its components, styles and variables. ' +
    'Build it with use_figma, then check it with get_screenshot.'));

  server.registerPrompt('tour_file', {
    title: 'Tour my open file',
    description: 'Summarize the pages, screens and design system of the open Figma file.',
  }, () => user(
    'Give me a tour of the file open in Figma Desktop: call whoami, get_metadata and ' +
    'search_design_system, then summarize its pages, main screens, components and variables.'));
}
