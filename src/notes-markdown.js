import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';

const renderer = new MarkdownIt({ html: false }).use(katex, {
  delimiters: 'dollars',
  trust: false,
  throwOnError: false,
});
const renderFence = renderer.renderer.rules.fence;
renderer.renderer.rules.fence = (tokens, index, options, env, self) => {
  const { info, content } = tokens[index];
  const svg = content.trim();
  if (info.trim().toLowerCase() !== 'svg' || !/^<svg(?:\s|>)[\s\S]*<\/svg>$/.test(svg)) {
    return renderFence(tokens, index, options, env, self);
  }
  // Load the SVG in image mode so its declarative animation can run in isolation.
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.toWellFormed());
  return '<img class="note-svg" alt="SVG illustration" src="' + renderer.utils.escapeHtml(url) + '">\n';
};
renderer.renderer.rules.image = (tokens, index, options, env, self) => (
  renderer.utils.escapeHtml(self.renderInlineAsText(tokens[index].children, options, env))
);
renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('rel', 'noreferrer');
  return self.renderToken(tokens, index, options);
};

export const renderNoteMarkdown = text => renderer.render(text);
