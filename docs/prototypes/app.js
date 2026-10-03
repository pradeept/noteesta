/* Static interaction study. No source contents leave the browser; all AI output is a labelled fixture. */
const style = document.body.dataset.style;
const styleNames = { geist: 'Geist Study', folio: 'Folio', grove: 'Grove' };
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sources = [
  {id:'lecture', name:'Lecture 04 · Photosynthesis', type:'Audio', detail:'28 min · class recording', excerpt:'08:42 — The light-dependent reactions take place in the thylakoid membrane. They supply ATP and NADPH to the Calvin cycle. Oxygen is released when water is split.'},
  {id:'slides', name:'Photosynthesis slides.pdf', type:'PDF', detail:'12 pages · lecture slides', excerpt:'Page 6 — The Calvin cycle takes place in the stroma. It uses ATP and NADPH to fix carbon dioxide and produce G3P, a building block for sugars.'},
  {id:'notes', name:'My handwritten notes.jpg', type:'Image', detail:'1 page · handwritten notes', excerpt:'Page 1 — Remember: light reactions → thylakoid; Calvin cycle → stroma. The two processes exchange ATP/ADP and NADPH/NADP+.'}
];
let selectedSources = sources.map(s => s.id);
let selectedExtras = ['flashcards','quiz','truefalse','roadmap'];
let noteTitle = 'Photosynthesis, made clear.';
let cardIndex = 0, cardFlipped = false, previewZoom = 1, toastTimer;
const cards = [
  ['Where do the light-dependent reactions happen?', 'In the thylakoid membrane of the chloroplast.'],
  ['What supplies energy to the Calvin cycle?', 'ATP and NADPH produced by the light-dependent reactions.'],
  ['Where does the oxygen released during photosynthesis come from?', 'Water, which is split during the light-dependent reactions.']
];
const diagram = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 300" role="img" aria-labelledby="diagramTitle diagramDesc">
<title id="diagramTitle">How the two stages of photosynthesis connect</title><desc id="diagramDesc">Light and water enter the light-dependent reactions in the thylakoid membrane, releasing oxygen. ATP and NADPH move to the Calvin cycle in the stroma. Carbon dioxide enters the cycle, and G3P is produced. ADP and NADP plus return to the light reactions.</desc>
<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#4e685b"/></marker></defs>
<rect width="760" height="300" fill="#f8faf8"/>
<g font-family="Arial,sans-serif" text-anchor="middle" fill="#253d31">
<rect x="45" y="85" width="225" height="124" rx="12" fill="#e5efe6" stroke="#749681"/>
<text x="157" y="126" font-size="18" font-weight="600">Light reactions</text><text x="157" y="153" font-size="13">Thylakoid membrane</text><text x="157" y="182" font-size="12">Capture light energy</text>
<rect x="480" y="85" width="235" height="124" rx="12" fill="#e7edf7" stroke="#8497b5"/>
<text x="597" y="126" font-size="18" font-weight="600">Calvin cycle</text><text x="597" y="153" font-size="13">Stroma</text><text x="597" y="182" font-size="12">Build carbon compounds</text>
<path d="M275 122H470" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/><text x="374" y="107" font-size="12">ATP + NADPH</text>
<path d="M475 181H280" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/><text x="374" y="204" font-size="12">ADP + NADP⁺</text>
<text x="157" y="37" font-size="13">Light + H₂O</text><path d="M157 46V77" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/>
<text x="597" y="37" font-size="13">CO₂</text><path d="M597 46V77" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/>
<path d="M157 214V250" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/><text x="157" y="276" font-size="13">O₂ released</text>
<path d="M597 214V250" stroke="#4e685b" stroke-width="2" marker-end="url(#arrow)"/><text x="597" y="276" font-size="13">G3P → sugars</text></g></svg>`;

$('#app').innerHTML = `
<a class="skip" href="#main">Skip to notes</a>
<div class="layout">
 <aside class="sidebar" id="sidebar" aria-label="Study library">
  <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">n</span>noteesta</a>
  <button class="new-pill primary" data-action="new">+ New study pill</button>
  <div class="library"><p class="side-label">Your study pills</p><button class="pill-link active" data-action="notes">Photosynthesis<span>Biology · 3 sources</span></button><button class="pill-link" data-action="library">Browse your sources<span>Recordings, documents & notes</span></button></div>
  <div class="side-footer"><div class="profile"><span class="avatar">ST</span>Your study space</div><a href="index.html">Compare design directions ↗</a><a href="../diagrams.html">Explore app diagrams ↗</a></div>
 </aside>
 <main class="workspace" id="main" tabindex="-1">
  <header class="topbar"><button class="mobile-menu plain" aria-controls="sidebar" aria-expanded="false" data-action="menu">☰ Library</button><div class="breadcrumb">My study pills <span>/</span> Biology</div><div class="toolbar"><button class="plain" data-action="focus" aria-pressed="false">Focus mode</button><button class="plain" data-action="settings" aria-label="Reading settings">Aa</button><button data-action="export">Export notes ↗</button></div></header>
  <div class="body-grid">
   <article class="document">
    <div class="meta"><span class="tag">Biology · Chapter 04</span><span>8 min read</span><span class="demo-badge">${styleNames[style]} / interactive demo</span></div>
    <h1 class="title">${noteTitle}</h1><p class="subtitle">From sunlight to stored energy. Your lecture, slides, and notes, brought together.</p>
    <div class="source-strip" aria-label="Sources for this study pill"></div>
    <nav class="tabs" aria-label="Study materials"><button class="tab" data-panel="notes" aria-pressed="true">Notes</button><button class="tab" data-panel="flashcards" aria-pressed="false">Flashcards <span class="tab-count">3</span></button><button class="tab" data-panel="quiz" aria-pressed="false">MCQs</button><button class="tab" data-panel="truefalse" aria-pressed="false">True / false</button><button class="tab" data-panel="roadmap" aria-pressed="false">Roadmap</button></nav>
    <section class="content-panel reading" id="panel-notes" aria-label="Notes">
     <div class="summary"><span class="summary-label">The big idea</span><p>Plants convert light energy into chemical energy. Two connected stages make it happen: <strong>light reactions capture energy</strong>, and the <strong>Calvin cycle uses it to build sugars.</strong> <button class="citation" data-source="lecture" aria-label="View source 1, lecture at 08:42">1</button></p></div>
     <section id="overview"><h2>First, the bigger picture</h2><p>Photosynthesis takes place in chloroplasts. Inside each chloroplast, stacks of membrane sacs called <strong>thylakoids</strong> are surrounded by a fluid called the <strong>stroma</strong>. Each stage has its own workspace.</p><p>Think of the light reactions as charging a battery. The Calvin cycle then spends that stored energy to turn carbon dioxide into useful carbon compounds. <button class="citation" data-source="slides" aria-label="View source 2, slides page 6">2</button></p></section>
     <section id="visual"><h2>How the two stages work together</h2><figure class="visual"><div class="visual-header"><span>Photosynthesis · energy flow</span><span class="helper">Click to explore ↗</span></div><button class="figure-button" data-action="preview" aria-label="Enlarge photosynthesis diagram">${diagram}</button><figcaption>ATP and NADPH connect the two stages. Conceptual diagram based on the sample lecture and slides. <button class="citation" data-source="slides" aria-label="View diagram source">2</button></figcaption></figure><details><summary>Read a text description of the diagram</summary><p>Light and water enter the light reactions, releasing oxygen. ATP and NADPH carry energy to the Calvin cycle, where carbon dioxide is used to produce G3P. ADP and NADP+ return to the light reactions.</p></details></section>
     <section id="compare"><h2>Two stages, side by side</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable stage comparison"><table><caption class="helper">A quick comparison of the two stages</caption><thead><tr><th scope="col">What to remember</th><th scope="col">Light reactions</th><th scope="col">Calvin cycle</th></tr></thead><tbody><tr><th scope="row">Location</th><td>Thylakoid membrane</td><td>Stroma</td></tr><tr><th scope="row">Inputs</th><td>Light, H₂O, ADP, NADP⁺</td><td>CO₂, ATP, NADPH</td></tr><tr><th scope="row">Outputs</th><td>O₂, ATP, NADPH</td><td>G3P, ADP, NADP⁺</td></tr></tbody></table></div></section>
     <section id="remember"><h2>A few things worth remembering</h2><ul><li>The oxygen released comes from <strong>water</strong>, not carbon dioxide.</li><li>“Light-independent” does not mean “only at night.” The Calvin cycle depends on the products of the light reactions.</li><li>G3P is a building block for sugars; the Calvin cycle does not directly produce a whole glucose molecule in one turn.</li></ul><button class="small" data-source="notes">See handwritten source ↗</button></section>
     <footer class="reading-footer"><span>Built from the sources in this pill only.</span><span>Sample content · not AI-generated live</span></footer>
    </section>
    <section class="content-panel reading" id="panel-flashcards" aria-label="Flashcards" hidden><span class="summary-label">A little practice goes a long way</span><h2>Recall it in your own words.</h2><p class="helper" id="card-counter"></p><button class="flashcard" id="flashcard" aria-label="Reveal flashcard answer"></button><div class="toolbar"><button data-action="prev-card">← Previous</button><button class="primary" data-action="flip">Reveal answer</button><button data-action="next-card">Next →</button></div></section>
    <section class="content-panel reading" id="panel-quiz" aria-label="Multiple-choice questions" hidden><span class="summary-label">Quick check · 1 question</span><h2>Which molecules carry energy from the light reactions to the Calvin cycle?</h2><div class="quiz-options"><button class="quiz-choice" data-answer="wrong">A. Oxygen and carbon dioxide</button><button class="quiz-choice" data-answer="correct">B. ATP and NADPH</button><button class="quiz-choice" data-answer="wrong">C. Glucose and water</button></div><div id="quiz-feedback" role="status"></div></section>
    <section class="content-panel reading" id="panel-truefalse" aria-label="True or false questions" hidden><span class="summary-label">True or false · 1 question</span><h2>The oxygen released during photosynthesis comes from carbon dioxide.</h2><div class="toolbar"><button data-tf="wrong">True</button><button data-tf="correct">False</button></div><div id="tf-feedback" role="status"></div></section>
    <section class="content-panel reading" id="panel-roadmap" aria-label="Study roadmap" hidden><span class="summary-label">Your study roadmap</span><h2>One topic, three small steps.</h2><p>Suggested order for this lesson. Move at your own pace.</p><ol class="steps"><li><span class="step-number">1</span><div><strong>Get the bigger picture</strong><br><span class="helper">Read the overview and identify the two locations.</span><br><button class="small" data-jump="overview">Read overview</button></div></li><li><span class="step-number">2</span><div><strong>Follow the energy</strong><br><span class="helper">Trace ATP and NADPH through the diagram.</span><br><button class="small" data-jump="visual">Open diagram section</button></div></li><li><span class="step-number">3</span><div><strong>Check your understanding</strong><br><span class="helper">Explain the stages, then try the optional practice.</span><br><button class="small" data-action="practice">Try flashcards</button></div></li></ol></section>
   </article>
   <nav class="outline" aria-label="On this page"><h2>On this page</h2><a href="#overview" aria-current="true">The bigger picture</a><a href="#visual">How it works</a><a href="#compare">Stage comparison</a><a href="#remember">Worth remembering</a><div class="outline-note"><strong>Your sources, connected.</strong>Every reference takes you back to the moment or page it came from.<button class="small" data-action="library">Manage sources</button></div></nav>
  </div>
 </main>
</div>
<dialog id="preview-dialog" class="preview" aria-labelledby="preview-heading"><div class="dialog-head"><h2 id="preview-heading">Photosynthesis · energy flow</h2><button data-close aria-label="Close image preview">Close ×</button></div><div class="preview-canvas"></div><div class="dialog-foot"><span class="helper">Escape to close · scroll to pan when zoomed</span><div class="toolbar"><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="zoom-reset" id="zoom-level">100%</button><button data-action="zoom-in" aria-label="Zoom in">+</button></div></div></dialog>
<dialog id="source-dialog" aria-labelledby="source-heading"><div class="dialog-head"><h2 id="source-heading">Source reference</h2><button data-close aria-label="Close source reference">Close ×</button></div><div class="dialog-body"><span class="tag" id="source-type"></span><h3 id="source-name"></h3><p id="source-excerpt"></p><p class="helper">Sample source excerpt. Real source playback and document viewing will be connected in the app.</p></div></dialog>
<dialog id="settings-dialog" aria-labelledby="settings-heading"><div class="dialog-head"><h2 id="settings-heading">Make yourself comfortable</h2><button data-close aria-label="Close reading settings">Close ×</button></div><div class="dialog-body"><label class="field">Text size<select id="text-size"><option value="16">Standard</option><option value="18">Large</option><option value="20">Extra large</option></select></label><label class="choice"><input type="checkbox" id="dark-theme">Dark appearance</label><p class="helper">Your browser’s reduced-motion preference is respected automatically.</p></div></dialog>
<dialog id="create-dialog" aria-labelledby="create-heading"><form id="create-form"><div class="dialog-head"><h2 id="create-heading">Build your study pill</h2><button type="button" data-close aria-label="Close study pill form">Close ×</button></div><div class="dialog-body"><p class="helper">Prototype: try the flow with the sample lesson. Files stay on your device; generation uses sample content.</p><label class="field">Pill name<input id="pill-name" required maxlength="100" value="Photosynthesis, made clear."></label><fieldset><legend>Choose from your sources</legend>${sources.map(s => `<label class="choice"><input name="source" type="checkbox" value="${s.id}" checked><span>${s.name}<small>${s.detail}</small></span></label>`).join('')}</fieldset><div class="dropzone"><label for="uploads">Or add recordings, documents, or images</label><input type="file" id="uploads" multiple accept="audio/*,video/*,image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt,.md"><p class="helper" id="file-summary">Select multiple files or use the sample sources above.</p></div><label class="field">YouTube link (optional)<input id="youtube" type="url" placeholder="https://www.youtube.com/watch?v=…"></label><fieldset><legend>Generate with your notes</legend><p class="helper">Notes with charts and visuals are always included.</p><div class="extras"><label class="choice"><input name="extra" type="checkbox" value="flashcards" checked>Flashcards</label><label class="choice"><input name="extra" type="checkbox" value="quiz" checked>MCQs</label><label class="choice"><input name="extra" type="checkbox" value="truefalse" checked>True / false</label><label class="choice"><input name="extra" type="checkbox" value="roadmap" checked>Roadmap</label></div></fieldset><p id="form-error" role="alert"></p><div id="generation" hidden><div class="progress-track"><div class="progress-fill"></div></div><p id="generation-status" role="status">Preparing sample sources…</p></div></div><div class="dialog-foot"><span class="helper">Only selected sources belong to this pill.</span><button class="primary" type="submit" id="generate-button">Generate demo notes →</button></div></form></dialog>
<div class="toast" role="status" aria-live="polite"></div>`;

function toast(message) { clearTimeout(toastTimer); $('.toast').textContent = message; toastTimer = setTimeout(() => $('.toast').textContent = '', 3800); }
function showDialog(id) { const dialog = $(id); dialog.returnFocus = document.activeElement; dialog.showModal(); }
$$('dialog').forEach(dialog => {
  dialog.addEventListener('close', () => dialog.returnFocus?.focus({preventScroll:true}));
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); }});
});
function sourceStrip() {
  $('.source-strip').innerHTML = selectedSources.map(id => {const s = sources.find(x => x.id === id); return `<button data-source="${escapeHTML(id)}"><span class="source-icon">${escapeHTML(s.type)}</span>${escapeHTML(s.name)}</button>`;}).join('') + '<button class="plain" data-action="library" aria-label="Add or manage sources">+ Add sources</button>';
}
function showPanel(panel) {
  if (panel !== 'notes' && !selectedExtras.includes(panel)) {toast('Add this material through Manage sources.');return;}
  $$('.content-panel').forEach(el => el.hidden = el.id !== `panel-${panel}`);
  $$('.tab').forEach(el => el.setAttribute('aria-pressed', el.dataset.panel === panel));
  $('.outline').style.visibility = panel === 'notes' ? '' : 'hidden';
  if (panel === 'flashcards') renderCard();
}
function renderCard() { $('#card-counter').textContent = `Card ${cardIndex + 1} of ${cards.length} · ${cardFlipped ? 'Answer' : 'Question'}`; $('#flashcard').textContent = cards[cardIndex][cardFlipped ? 1 : 0]; $('#flashcard').setAttribute('aria-label', cardFlipped ? 'Show flashcard question' : 'Reveal flashcard answer'); $('[data-action=flip]').textContent = cardFlipped ? 'Show question' : 'Reveal answer'; }
function zoom(change) {previewZoom = Math.max(1,Math.min(3,previewZoom + change)); $('.preview-canvas svg').style.width = `${previewZoom * 100}%`; $('#zoom-level').textContent = `${Math.round(previewZoom * 100)}%`;}
function openCreate() {$('#pill-name').value = noteTitle; $$('[name=source]').forEach(el => el.checked = selectedSources.includes(el.value)); $$('[name=extra]').forEach(el => el.checked = selectedExtras.includes(el.value)); showDialog('#create-dialog');}
document.addEventListener('click', event => {
  const el = event.target.closest('button'); if (!el) return;
  if (el.hasAttribute('data-close')) {el.closest('dialog').close();return;}
  if (el.dataset.panel) showPanel(el.dataset.panel);
  if (el.dataset.source) { const source = sources.find(s => s.id === el.dataset.source); $('#source-name').textContent = source.name; $('#source-type').textContent = source.type; $('#source-excerpt').textContent = source.excerpt; showDialog('#source-dialog'); }
  if (el.dataset.jump) {showPanel('notes'); document.getElementById(el.dataset.jump).scrollIntoView();}
  if (el.dataset.answer) $('#quiz-feedback').innerHTML = `<div class="feedback">${el.dataset.answer === 'correct' ? 'Exactly right.' : 'Not quite. The answer is B: ATP and NADPH.'} These molecules connect energy capture to carbon fixation. <button class="citation" data-source="lecture">Source 1</button></div>`;
  if (el.dataset.tf) $('#tf-feedback').innerHTML = `<div class="feedback">${el.dataset.tf === 'correct' ? 'Correct: false.' : 'This statement is false.'} The oxygen comes from water split during the light reactions. <button class="citation" data-source="lecture">Source 1</button></div>`;
  switch (el.dataset.action) {
    case 'new': case 'library': openCreate(); break;
    case 'notes': showPanel('notes'); break;
    case 'settings': showDialog('#settings-dialog'); break;
    case 'focus': {const enabled = document.body.classList.toggle('focus-mode'); el.setAttribute('aria-pressed',enabled); el.textContent = enabled ? 'Exit focus' : 'Focus mode'; break;}
    case 'menu': {const enabled = $('#sidebar').classList.toggle('mobile-open'); el.setAttribute('aria-expanded',enabled); break;}
    case 'preview': $('.preview-canvas').innerHTML = diagram.replaceAll('diagramTitle','previewTitle').replaceAll('diagramDesc','previewDesc').replaceAll('id="arrow"','id="previewArrow"').replaceAll('url(#arrow)','url(#previewArrow)'); previewZoom=1; zoom(0); showDialog('#preview-dialog'); break;
    case 'zoom-in': zoom(.25); break; case 'zoom-out': zoom(-.25); break; case 'zoom-reset': previewZoom=1;zoom(0);break;
    case 'flip': cardFlipped=!cardFlipped;renderCard();break;
    case 'prev-card': cardIndex=(cardIndex+cards.length-1)%cards.length;cardFlipped=false;renderCard();break;
    case 'next-card': cardIndex=(cardIndex+1)%cards.length;cardFlipped=false;renderCard();break;
    case 'practice': showPanel('flashcards');break;
    case 'export': exportNotes(el);break;
  }
});
$('#flashcard').addEventListener('click', () => {cardFlipped=!cardFlipped;renderCard();});
$('.outline').addEventListener('click', event => {if(event.target.closest('a')) showPanel('notes');});
$('#text-size').addEventListener('change', event => document.body.style.setProperty('--reading-size',`${event.target.value}px`));
$('#dark-theme').addEventListener('change', event => document.body.classList.toggle('dark',event.target.checked));
$('#uploads').addEventListener('change', event => $('#file-summary').textContent = [...event.target.files].map(f => f.name).join(', ') || 'Select multiple files or use the sample sources above.');
let generationTimer;
$('#create-dialog').addEventListener('close', () => {clearInterval(generationTimer);$('#generate-button').disabled=false;$('#generation').hidden=true;});
$('#create-form').addEventListener('submit', event => {
  event.preventDefault(); const chosen = $$('[name=source]:checked').map(el => el.value); const files = [...$('#uploads').files]; const youtube = $('#youtube').value.trim();
  if (!chosen.length && !files.length && !youtube) {$('#form-error').textContent='Choose at least one source or add a file or YouTube link.';return;}
  if (youtube) {const host=new URL(youtube).hostname.toLowerCase();if (!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)) {$('#form-error').textContent='Please enter a YouTube link.';return;}}
  $('#form-error').textContent=''; $('#generate-button').disabled=true; $('#generation').hidden=false; let step=0;
  const stages=['Reading selected sample sources…','Combining all sections…','Preparing notes and selected extras…','Your demo study pill is ready.'];
  const update=()=>{$('.progress-fill').style.width=`${(step+1)*25}%`;$('#generation-status').textContent=stages[step];}; update();
  generationTimer=setInterval(()=>{step++;if(step<4){update();return;}clearInterval(generationTimer);
    selectedExtras=$$('[name=extra]:checked').map(el=>el.value);
    // The rendered lesson is always the fixture: never attribute it to unprocessed user files.
    selectedSources=sources.map(s=>s.id); noteTitle=$('#pill-name').value.trim()||'Photosynthesis, made clear.';
    $('.title').textContent=noteTitle; $('.subtitle').textContent='Demo photosynthesis lesson. The sources below are sample fixtures; your files have not been processed.';
    $$('.tab').forEach(el=>{el.hidden=el.dataset.panel!=='notes'&&!selectedExtras.includes(el.dataset.panel);});
    $('.pill-link.active').innerHTML=`${escapeHTML(noteTitle)}<span>Sample lesson · 3 fixture sources</span>`;
    sourceStrip();showPanel('notes');$('#create-dialog').close();toast('Demo notes ready. Selected extras are included; content uses sample sources.');
  },650);
});
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){$$('.outline a').forEach(a=>a.setAttribute('aria-current',a.hash===`#${entry.target.id}`));}}, {rootMargin:'-15% 0px -65% 0px'});
$$('#panel-notes > section').forEach(section=>observer.observe(section));
sourceStrip();renderCard();

function markdown() {
  let output = `# ${noteTitle}\n\n> Noteesta design prototype: sample lesson, not generated from uploaded files.\n\n## The big idea\n\nPlants convert light energy into chemical energy. Light reactions capture energy; the Calvin cycle uses it to build carbon compounds. [1]\n\n## How the stages connect\n\n![Light reactions supply ATP and NADPH to the Calvin cycle.](assets/photosynthesis.png)\n\nLight reactions happen in the thylakoid membrane. The Calvin cycle happens in the stroma. Oxygen is released from water; the cycle fixes carbon dioxide into G3P. [1][2]\n\n| Stage | Location | Key outputs |\n| --- | --- | --- |\n| Light reactions | Thylakoid membrane | Oxygen, ATP, NADPH |\n| Calvin cycle | Stroma | G3P, ADP, NADP+ |\n\n## Remember\n\n- Oxygen comes from water.\n- The Calvin cycle depends on products of the light reactions.\n- G3P is a building block for sugars.\n`;
  if(selectedExtras.includes('flashcards'))output+='\n## Flashcards\n\n'+cards.map(([q,a])=>`**${q}**\n\n${a}\n`).join('\n');
  if(selectedExtras.includes('quiz'))output+='\n## MCQ\n\nWhich molecules carry energy to the Calvin cycle?\n\nA. Oxygen and carbon dioxide\nB. ATP and NADPH\nC. Glucose and water\n\nAnswer: B. ATP and NADPH connect the stages. [1]\n';
  if(selectedExtras.includes('truefalse'))output+='\n## True or false\n\nOxygen released during photosynthesis comes from carbon dioxide.\n\nFalse: it comes from water. [1]\n';
  if(selectedExtras.includes('roadmap'))output+='\n## Roadmap\n\n1. Read the overview.\n2. Follow energy through the diagram.\n3. Explain the stages in your own words.\n';
  return output+'\n## Sample source references\n\n[1] Lecture 04, 08:42.\n[2] Photosynthesis slides, page 6.\n[3] Handwritten notes, page 1.\n';
}
// Uncompressed ZIP: small dependency-free archive for this prototype only.
function zip(files) {
  const encoder=new TextEncoder(), parts=[], central=[]; let offset=0;
  const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
  for(const [filename,bytes] of files){const name=encoder.encode(filename),crc=crc32(bytes);const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,bytes);
    const header=new Uint8Array(46+name.length),h=new DataView(header.buffer);h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(14,33,true);h.setUint32(16,crc,true);h.setUint32(20,bytes.length,true);h.setUint32(24,bytes.length,true);h.setUint16(28,name.length,true);h.setUint32(42,offset,true);header.set(name,46);central.push(header);offset+=local.length+bytes.length;}
  const size=central.reduce((sum,p)=>sum+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function exportNotes(button) {
  button.disabled=true;
  try {const image=new Image();const svgURL=URL.createObjectURL(new Blob([diagram],{type:'image/svg+xml'}));try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=svgURL;});}finally{URL.revokeObjectURL(svgURL);}
    const canvas=document.createElement('canvas');canvas.width=1520;canvas.height=600;canvas.getContext('2d').drawImage(image,0,0,1520,600);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Unable to render chart');
    const archive=zip([['notes.md',new TextEncoder().encode(markdown())],['assets/photosynthesis.png',new Uint8Array(await png.arrayBuffer())]]);const url=URL.createObjectURL(archive),a=document.createElement('a');a.href=url;a.download='noteesta-study-pill.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Exported Markdown notes and diagram together.');
  }catch(error){console.error(error);toast('Export could not finish. Please try again in a current browser.');}finally{button.disabled=false;}
}
