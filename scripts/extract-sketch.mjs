import fs from 'node:fs';
const original = fs.readFileSync('C:/Users/thail/Downloads/sources_pdf_directory.html', 'utf8');
fs.mkdirSync('reference', { recursive: true });
fs.mkdirSync('src', { recursive: true });
fs.writeFileSync('reference/sources_pdf_directory.original.html', original);
fs.writeFileSync('src/styles.css', original.match(/<style>([\s\S]*?)<\/style>/)[1] + '\n/* Honor logical visibility even when an element has a display rule. */\n[hidden] { display: none !important; }\n');
let html = original.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/src/styles.css">')
  .replace(/    <script src="https:[^\n]+\n/, '')
  .replace(/    <script>[\s\S]*?<\/script>/, '    <script type="module" src="/src/app.js"></script>');
fs.writeFileSync('index.html', html);
