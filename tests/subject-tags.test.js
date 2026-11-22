import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubjectTags, createDetailSubjectTags, documentSubjects } from '../src/subject-tags.js';
import { queryFiles, subjectNames, openLibrary, saveDocuments, readDocuments } from '../src/library.js';
import { IDBFactory } from 'fake-indexeddb';

test('tag input commits Enter/comma, normalizes and deduplicates, removes tags and saves unfinished text', () => {
  const previous = globalThis.document;
  const elements = [];
  globalThis.document = { createElement() {
    const element = { children: [], value: '', setAttribute() {}, setCustomValidity() {}, reportValidity() {}, focus() {},
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } };
    elements.push(element); return element;
  } };
  try {
    const editor = createSubjectTags({ prepend() {} });
    editor.set([], true);
    const input = elements.find(item => item.id === 'problemSubjectTagsInput');
    input.value = 'Math, geometry, math'; input.onkeydown({ key: 'Enter', preventDefault() {} });
    assert.deepEqual(editor.get(), ['math', 'geometry']);
    const tags = elements.find(item => item.className === 'subject-tag-items');
    tags.children[0].children[1].onclick(); assert.deepEqual(editor.get(), ['geometry']);
    input.value = 'linear algebra'; assert.deepEqual(editor.get(), ['geometry', 'linear-algebra']);
    editor.set([], true); assert.throws(() => editor.get(), /subject/);
    input.value = 'a/b'; assert.throws(() => editor.get(), /slashes/);
  } finally { globalThis.document = previous; }
});

test('multiple subjects survive reload and each filters the same problem once; legacy Sources are unchanged', async () => {
  const file = { id: 'p', kind: 'problem', name: 'question.png', subject: 'math', subjects: ['math', 'geometry'], topic: '' };
  const db = await openLibrary(new IDBFactory()); await saveDocuments(db, [file]);
  const [restored] = await readDocuments(db); db.close();
  assert.deepEqual(subjectNames([restored], 'problems'), ['math', 'geometry']);
  for (const subject of restored.subjects) assert.equal(queryFiles([restored], { subject }).total, 1);
  assert.equal(queryFiles([restored]).total, 1);
  assert.deepEqual(documentSubjects({ kind: 'problem', subject: 'old' }), ['old']);
  assert.deepEqual(documentSubjects({ subject: 'math', subjects: ['ignored'] }), ['math']);
});

test('inline tag changes await saving and restore the previous tags if saving fails', async () => {
 const previous=globalThis.document, elements=[]; let rejectSave, saved;
 globalThis.document={createElement(){const el={children:[],value:'',setAttribute(){},setCustomValidity(v){this.error=v},reportValidity(){},focus(){},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};elements.push(el);return el;}};
 try {
 const editor=createSubjectTags({prepend(){}},{id:'inline',onChange:values=>new Promise((resolve,reject)=>{saved=values;rejectSave=reject;})});
 editor.set(['math','geometry'],true);
 const tags=elements.find(el=>el.className==='subject-tag-items');
 const pending=tags.children[0].children[1].onclick();
 assert.deepEqual(saved,['geometry']); rejectSave(Error('offline')); await pending;
 assert.deepEqual(editor.get(),['math','geometry']);
 }finally{globalThis.document=previous;}
});

test('comma keeps typing focused and accepts successive tags while earlier saves are pending', async () => {
 const previous=globalThis.document, elements=[], requests=[];
 globalThis.document={createElement(){const el={children:[],value:'',setAttribute(){},setCustomValidity(v){this.error=v},reportValidity(){},focus(){this.focused=true},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};elements.push(el);return el;}};
 try {
 const editor=createSubjectTags({prepend(){}},{onChange:values=>new Promise((resolve,reject)=>requests.push({values,resolve,reject}))});
 editor.set(['math'],true);
 const input=elements.find(el=>el.id==='problemSubjectTagsInput');
 input.value='geometry'; input.onkeydown({key:',',preventDefault(){}});
 assert.equal(input.focused,true); assert.notEqual(input.disabled,true); assert.equal(input.value,'');
 input.value='modulo'; input.onkeydown({key:',',preventDefault(){}});
 assert.deepEqual(requests[1].values,['math','geometry','modulo']);
 input.value='next draft'; requests[0].resolve(); requests[1].resolve();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(input.value,'next draft'); assert.notEqual(input.disabled,true);
 input.value=''; assert.deepEqual(editor.get(),['math','geometry','modulo']);
 assert.equal(elements.find(el=>el.className==='subject-tags').className,'subject-tags');
 }finally{globalThis.document=previous;}
});

test('detail starts with compact tags only and opens editing on demand without a permanent input row', () => {
 const previous=globalThis.document, elements=[];
 const make=()=>({children:[],value:'',events:{},setAttribute(){},setCustomValidity(){},reportValidity(){},focus(){},append(...items){this.children.push(...items)},prepend(...items){this.children.unshift(...items)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.events[type]=fn;}});
 globalThis.document={createElement(){const el=make();elements.push(el);return el;}};
 try {
 const container=make(), editor=createDetailSubjectTags(container,async()=>{});
 editor.set(['geometry']);
 const display=elements.find(el=>el.className==='detail-subject-display');
 const field=elements.find(el=>el.className==='modal-field problem-subject-field');
 assert.equal(field.hidden,true); assert.equal(display.hidden,false);
 assert.equal(display.children[0].textContent,'geometry');
 display.children[0].onclick(); assert.equal(field.hidden,false); assert.equal(display.hidden,true);
 field.events.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(field.hidden,true); assert.equal(display.hidden,false);
 }finally{globalThis.document=previous;}
});
