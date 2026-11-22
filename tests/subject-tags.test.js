import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubjectTags, createDetailSubjectTags, documentSubjects, tagRowCount } from '../src/subject-tags.js';
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

test('detail can delete the last tag, save an empty list, and add tags again; Backspace preserves ordinary typing', async () => {
 const previous=globalThis.document,elements=[],saved=[];
 const make=()=>({children:[],value:'',events:{},setAttribute(){},setCustomValidity(){},reportValidity(){},focus(){},append(...items){this.children.push(...items)},prepend(...items){this.children.unshift(...items)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.events[type]=fn;}});
 globalThis.document={createElement(){const el=make();elements.push(el);return el;}};
 try {
 const editor=createDetailSubjectTags(make(),async values=>saved.push(values)); editor.set(['math','geometry']);
 const display=elements.find(el=>el.className==='detail-subject-display'); display.children[0].onclick();
 const input=elements.find(el=>el.id==='detailSubjectTagsInput'), tags=elements.find(el=>el.className==='subject-tag-items');
 input.value='draft'; input.onkeydown({key:'Backspace',preventDefault(){assert.fail('normal typing must remain native')}}); assert.equal(saved.length,0);
 input.value=''; await input.onkeydown({key:'Backspace',preventDefault(){}});
 assert.deepEqual(saved[0],['math']); assert.equal(tags.children.length,1);
 await tags.children[0].children[1].onclick(); assert.deepEqual(saved[1],[]);
 assert.equal(tags.children.length,0); assert.equal(display.children[0].textContent,'Add subject');
 input.value='algebra'; input.onkeydown({key:',',preventDefault(){}}); await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(saved[2],['algebra']); assert.equal(display.children[0].textContent,'algebra');
 }finally{globalThis.document=previous;}
});

test('clicking X cannot collapse the editor during input-to-button focus transfer', async () => {
 const previous=globalThis.document,elements=[],saved=[];
 const make=()=>({children:[],value:'',events:{},setAttribute(){},setCustomValidity(){},reportValidity(){},focus(){globalThis.document.activeElement=this},contains(node){return this===node||this.children.some(child=>child.contains?.(node))},append(...items){this.children.push(...items)},prepend(...items){this.children.unshift(...items)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.events[type]=fn;}});
 globalThis.document={activeElement:null,createElement(){const el=make();elements.push(el);return el;}};
 try {
 const container=make(), editor=createDetailSubjectTags(container,async values=>saved.push(values)); editor.set(['math','geometry']);
 const display=elements.find(el=>el.className==='detail-subject-display'); display.children[0].onclick();
 const field=elements.find(el=>el.className==='modal-field problem-subject-field');
 const tags=elements.find(el=>el.className==='subject-tag-items'), remove=tags.children[0].children[1];
 globalThis.document.activeElement=null;
 field.events.focusout({relatedTarget:remove});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(field.hidden,false,'focus inside the editor never closes it');
 let prevented=false,stopped=false;
 remove.onpointerdown({button:0,preventDefault(){prevented=true}}); assert.equal(prevented,true);
 await remove.onclick({preventDefault(){},stopPropagation(){stopped=true}});
 assert.equal(stopped,true); assert.deepEqual(saved,[['geometry']]);
 assert.equal(field.hidden,false); assert.equal(display.hidden,true);
 field.events.focusout({relatedTarget:null});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(field.hidden,false,'input has regained focus after removal');
 }finally{globalThis.document=previous;}
});

test('subject suggestions exclude selected tags, filter typing, and commit mouse/keyboard choices once', () => {
 const previous={document:globalThis.document,window:globalThis.window}, elements=[];
 const make=()=>({children:[],value:'',events:{},style:{},attrs:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},setCustomValidity(){},reportValidity(){},focus(){},contains(){return true},scrollIntoView(){},getBoundingClientRect(){return {top:100,bottom:130}},append(...items){for(const item of items){item.parentElement=this;this.children.push(item)}},prepend(...items){this.append(...items)},replaceChildren(...items){this.children=[];this.append(...items)},addEventListener(type,fn,capture){this.events[type]={fn,capture}}});
 globalThis.document={createElement(){const el=make();elements.push(el);return el},addEventListener(){}};globalThis.window={innerHeight:800,addEventListener(){}};
 try {
 const editor=createSubjectTags(make(),{getSuggestions:()=>['math','geometry','algebra','math']}); editor.set(['math'],true);
 const input=elements.find(el=>el.id==='problemSubjectTagsInput'), list=elements.find(el=>el.attrs.role==='listbox');
 input.events.focus.fn(); assert.deepEqual(list.children.map(el=>el.textContent),['algebra','geometry']); assert.equal(list.style.maxHeight,'194px');
 list.children[0].onclick(); assert.deepEqual(editor.get(),['math','algebra']); assert.equal(input.value,'');
 input.value='geo'; input.events.input.fn(); assert.equal(list.children.length,1);
 input.events.keydown.fn({key:'ArrowDown',preventDefault(){}});
 let stopped=false; input.events.keydown.fn({key:'Enter',preventDefault(){},stopImmediatePropagation(){stopped=true}});
 assert.equal(input.events.keydown.capture,true); assert.equal(stopped,true);
 assert.deepEqual(editor.get(),['math','algebra','geometry']); assert.equal(list.hidden,true);
 input.events.focus.fn(); assert.equal(list.hidden,true,'all existing subjects selected');
 }finally{Object.assign(globalThis,previous)}
});

test('detail row reserves ellipsis space only when tags overflow and adapts to the available width', () => {
 assert.equal(tagRowCount(200,[60,60,60],20),3);
 assert.equal(tagRowCount(150,[60,60,60],20),1);
 assert.equal(tagRowCount(170,[60,60,60],20),2);
 assert.equal(tagRowCount(40,[60,60],20),0);
 assert.equal(tagRowCount(200,[],20),0);
});

test('overflow ellipsis expands all detail tags and resets for the next problem', () => {
 const previous=globalThis.document,elements=[];
 const make=()=>({children:[],value:'',events:{},classList:{toggle(){}},setAttribute(){},setCustomValidity(){},reportValidity(){},focus(){},getBoundingClientRect(){return {width:this.className==='detail-subject-display'?150:this.className?.includes('detail-subject-more')?20:60}},append(...items){this.children.push(...items)},prepend(...items){this.children.unshift(...items)},replaceChildren(...items){this.children=items},addEventListener(type,fn){this.events[type]=fn;}});
 globalThis.document={createElement(){const el=make();elements.push(el);return el;}};
 try {
 const editor=createDetailSubjectTags(make(),async()=>{});editor.set(['math','geometry','modulo']);
 const display=elements.find(el=>el.className==='detail-subject-display');
 const more=display.children.at(-1); assert.equal(more.textContent,'...'); assert.equal(more.hidden,false);
 assert.equal(display.children[1].hidden,true);
 assert.ok(more.className.includes('subject-tag'));
 more.onclick();assert.equal(more.hidden,false);assert.match(more.innerHTML, /<svg/); assert.match(more.innerHTML, /aria-hidden="true"/);assert.ok(display.children.slice(0,-1).every(tag=>!tag.hidden));
 more.onclick();assert.equal(more.textContent,'...');assert.equal(display.children[1].hidden,true);
 editor.set(['math','geometry','modulo']);assert.equal(display.children.at(-1).hidden,false);
 }finally{globalThis.document=previous;}
});
