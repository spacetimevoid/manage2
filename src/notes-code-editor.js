import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { xmlLanguage } from '@codemirror/lang-xml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const inlineMath = /^\$(?![\s$])(?:\\[^\n]|[^$\\\n])+?(?<!\s)\$(?![\d$])/;
const mathFence = /^\$\$(?!\$)/;
const endMathFence = /(?:^|[^\\])\$\$$/;

function mathCommands(context, text, offset) {
  return [...text.matchAll(/\\(?:[A-Za-z]+|[^\s])/g)]
    .map(match => context.elt('MathCommand', offset + match.index, offset + match.index + match[0].length));
}

const mathSyntax = {
  defineNodes: [
    { name: 'InlineMath', style: tags.atom },
    { name: 'DisplayMath', block: true, style: tags.atom },
    { name: 'MathCommand', style: tags.special(tags.keyword) },
  ],
  parseInline: [{
    name: 'InlineMath',
    after: 'Escape',
    parse(context, next, position) {
      if (next !== 36 || context.char(position - 1) === 36) return -1;
      const formula = inlineMath.exec(context.slice(position, context.end))?.[0];
      if (!formula) return -1;
      return context.addElement(context.elt('InlineMath', position, position + formula.length,
        mathCommands(context, formula, position)));
    },
  }],
  parseBlock: [{
    name: 'DisplayMath',
    parse(context, line) {
      const first = line.text.slice(line.pos).trimEnd();
      if (!mathFence.test(first)) return false;
      const from = context.lineStart + line.pos;
      let to = context.lineStart + line.text.length;
      const commands = mathCommands(context, first, from);
      let closed = endMathFence.test(first.slice(2));
      while (context.nextLine()) {
        if (closed) break;
        const source = line.text.slice(line.pos).trimEnd();
        commands.push(...mathCommands(context, source, context.lineStart + line.pos));
        to = context.lineStart + line.text.length;
        closed = endMathFence.test(source);
      }
      context.addElement(context.elt('DisplayMath', from, to, commands));
      return true;
    },
  }],
};

const colors = HighlightStyle.define([
  { tag: tags.heading, color: '#6941a5', fontWeight: '600' },
  { tag: tags.strong, color: '#744371', fontWeight: '600' },
  { tag: tags.emphasis, color: '#744371', fontStyle: 'italic' },
  { tag: [tags.link, tags.url, tags.tagName], color: '#1856a3' },
  { tag: [tags.processingInstruction, tags.meta, tags.comment], color: '#626b77' },
  { tag: tags.attributeName, color: '#774598' },
  { tag: tags.string, color: '#276337' },
  { tag: [tags.atom, tags.number, tags.monospace], color: '#006c75' },
  { tag: tags.special(tags.keyword), color: '#9a430d' },
]);

const language = markdown({
  base: markdownLanguage,
  extensions: mathSyntax,
  codeLanguages: info => /^(svg|xml)$/i.test(info.trim().split(/\s/, 1)[0]) ? xmlLanguage : null,
  addKeymap: false,
  pasteURLAsLink: false,
  completeHTMLTags: false,
});

export function createNoteEditor(parent, textarea, onChange) {
  const editability = new Compartment();
  const editable = enabled => [EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)];
  const view = new EditorView({
    parent,
    doc: textarea.value,
    selection: { anchor: textarea.selectionStart, head: textarea.selectionEnd },
    extensions: [
      language,
      syntaxHighlighting(colors),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      editability.of(editable(!textarea.disabled && !textarea.closest('fieldset:disabled'))),
      EditorView.contentAttributes.of({ 'aria-labelledby': 'noteMarkdownLabel', spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        textarea.value = update.state.doc.toString();
        onChange();
      }),
    ],
  });
  view.scrollDOM.scrollTop = textarea.scrollTop;
  return {
    focus: () => view.focus(),
    setEditable: enabled => view.dispatch({ effects: editability.reconfigure(editable(enabled)) }),
    destroy: () => view.destroy(),
  };
}
