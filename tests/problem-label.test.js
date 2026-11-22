import test from 'node:test';
import assert from 'node:assert/strict';
import { problemCode, problemSummary, createProblemTagsPopover } from '../src/problem-label.js';
import { queryFiles } from '../src/library.js';

test('summary shows two tags and accurate overflow count, escaping all user content', () => {
 const file = { id: 'abc12345-0000', kind: 'problem', subjects: ['math', 'candy', '<script>', 'modulo'] };
 const html = problemSummary(file);
 assert.ok(html.includes(problemCode(file))); assert.match(problemCode(file), /^#[0-9]{5}-[0-9]{5}$/); assert.match(html, /math/); assert.match(html, /candy/); assert.match(html, />\+2</);
 assert.doesNotMatch(html, /modulo|<script>/);
 assert.doesNotMatch(problemSummary({ ...file, subjects: ['math'] }), /data-problem-tags/);
 assert.equal(problemCode({ ...file, name: 'renamed' }), problemCode(file));
});

test('overflow popover shows every tag as text without navigating and toggles closed', () => {
 const previous = globalThis.document; let popover;
 globalThis.document = { body: { append(element) { popover = element; } }, createElement() { return { style: {}, attrs: {}, setAttribute(k,v) { this.attrs[k]=v; }, addEventListener() {}, replaceChildren(...children) { this.children=children; }, matches() { return !!this.open; }, showPopover() { this.open=true; }, hidePopover() { this.open=false; }, offsetWidth:200, offsetHeight:100 }; } };
 const priorWidth = globalThis.innerWidth, priorHeight = globalThis.innerHeight; globalThis.innerWidth=800; globalThis.innerHeight=600;
 try {
 const show=createProblemTagsPopover(), button={ setAttribute() {}, getBoundingClientRect:()=>({left:100,bottom:200}) };
 show(button,{kind:'problem',subjects:['a','b','c','<d>']}); assert.equal(popover.open,true);
 assert.deepEqual(popover.children.map(tag=>tag.textContent), ['a','b','c','<d>']);
 show(button,{kind:'problem',subjects:[]}); assert.equal(popover.open,false);
 } finally { globalThis.document=previous; globalThis.innerWidth=priorWidth; globalThis.innerHeight=priorHeight; }
});
