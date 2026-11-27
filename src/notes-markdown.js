import MarkdownIt from 'markdown-it';
import { katex } from '@mdit/plugin-katex';

const renderer = new MarkdownIt({ html: false }).use(katex, {
  delimiters: 'dollars',
  trust: false,
  throwOnError: false,
});
renderer.renderer.rules.image = (tokens, index, options, env, self) => (
  renderer.utils.escapeHtml(self.renderInlineAsText(tokens[index].children, options, env))
);
renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('rel', 'noreferrer');
  return self.renderToken(tokens, index, options);
};

export const renderNoteMarkdown = text => renderer.render(text);
