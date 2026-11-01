const STORAGE = 'essay-studio-v1';
const coreCards = cards.filter(c => c.core);
const cardById = Object.fromEntries(cards.map(c => [c.id,c]));
const main = document.getElementById('main');
const defaultState = () => ({version:1, cardId:'c01', progress:{}, mistakes:{}, words:[], notes:{}, coreOnly:true});
let storageOK = true;
let state = defaultState();
try {const saved = localStorage.getItem(STORAGE); if(saved) state = validateState(JSON.parse(saved));} catch {storageOK = false;}
let page = ['learn','vocab','essay','review'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'learn';
let mode='explain', revealed=false, quizAnswer=null, vocabFilter='all', vocabQuery='', hideWords=false;
let essayId='dynamic', essayOutline=true, review=null, toastTimer;
const E = text => String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sentenceHTML = text => E(text).replace(/\[([^\]]+)\]/g,'<span class="slot">$1</span>');
const pct = n => Math.round(n/coreCards.length*100);
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function validateState(raw){
 if(!raw || raw.version!==1 || !raw.progress || typeof raw.progress!=='object') throw new Error('文件格式不匹配');
 const next = defaultState();
 next.cardId=cardById[raw.cardId]?raw.cardId:'c01'; next.coreOnly=raw.coreOnly!==false;
 for(const [id,p] of Object.entries(raw.progress)){
  if(!cardById[id] || !p || !Number.isInteger(p.level) || p.level<0 || p.level>2 || !Number.isFinite(p.due) || p.due<0) continue;
  next.progress[id]={level:p.level,due:p.due,reps:Math.max(0,Math.min(10000,Number(p.reps)||0)),last:Math.max(0,Number(p.last)||0)};
 }
 for(const [id,m] of Object.entries(raw.mistakes||{})) if(cardById[id] && Number.isFinite(m)) next.mistakes[id]=Math.max(0,Math.min(10000,m));
 next.words=Array.isArray(raw.words)?[...new Set(raw.words.filter(x=>Number.isInteger(x)&&x>=0&&x<vocabulary.length))]:[];
 for(const essay of essays) if(typeof raw.notes?.[essay.id]==='string') next.notes[essay.id]=raw.notes[essay.id].slice(0,20000);
 return next;
}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));storageOK=true;}catch{storageOK=false;toast('浏览器未允许保存记录，请使用“导出进度”备份。');}}
function toast(message){clearTimeout(toastTimer);const t=document.getElementById('toast');t.textContent=message;t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),3200);}
function stats(){return {mastered:coreCards.filter(c=>state.progress[c.id]?.level===2).length,due:cards.filter(c=>state.progress[c.id]&&state.progress[c.id].due<=Date.now()).length,learned:coreCards.filter(c=>state.progress[c.id]).length};}
function grade(id,level){
 const p=state.progress[id]||{reps:0};const reps=p.reps+1;const days=level===0?0:level===1?1:reps>=3?7:3;
 state.progress[id]={level,reps,due:Date.now()+days*86400000,last:Date.now()};save();
 if(review){review.results.push({id,level});review.index++;revealed=false;render();}
 else{renderShell();toast(level===0?'已放回待复习，稍后再试一次。':`已记录，${days}天后复习。`);}
}
function shownCards(chapter){const all=cards.filter(c=>c.chapter===chapter);return state.coreOnly && all.some(c=>c.core)?all.filter(c=>c.core):all;}
function openCard(id,newMode='explain'){if(!cardById[id])return;state.cardId=id;if(!cardById[id].core)state.coreOnly=false;save();page='learn';mode=newMode;revealed=false;quizAnswer=null;review=null;setHash();render();}
function setHash(){try{history.replaceState(null,'','#'+page);}catch{}}
function goPage(p){if(!['learn','vocab','essay','review'].includes(p))return;page=p;review=null;revealed=false;quizAnswer=null;setHash();render();window.scrollTo({top:0,behavior:'instant'});}
function renderShell(){
 const chapter=cardById[state.cardId].chapter;
 document.getElementById('chapters').innerHTML=chapters.map(c=>`<button class="chapter ${page==='learn'&&c.id===chapter?'active':''}" data-action="chapter" data-id="${c.id}" ${page==='learn'&&c.id===chapter?'aria-current="step"':''}><span class="num">${c.num}</span><span><strong>${c.title}</strong><small>${c.id==='chart'?'观察 · 描述 · 概括':c.id==='reason'?'解释原因，说出道理':c.id==='ending'?'总结与行动':c.id==='picture'?'主线学稳后补充':'主线学稳后补充'}</small></span></button>`).join('');
 document.getElementById('main-tabs').innerHTML=[['learn','句型学习'],['vocab','最小词库'],['essay','整篇套用'],['review','我的复习']].map(([id,label])=>`<button data-action="page" data-id="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${label}</button>`).join('');
 const s=stats();document.getElementById('side-progress').innerHTML=`<div class="numbers"><span>核心句型 · 已熟练</span><span>${s.mastered} / ${coreCards.length}</span></div><div class="meter" role="progressbar" aria-label="核心句型掌握进度" aria-valuemin="0" aria-valuemax="${coreCards.length}" aria-valuenow="${s.mastered}"><i style="width:${pct(s.mastered)}%"></i></div>`;
}
function render(){renderShell();main.innerHTML=(!storageOK?'<div class="backup-warning">当前浏览器无法恢复或保存记录。你仍可学习，离开前请导出进度。</div>':'')+(page==='learn'?learnView():page==='vocab'?vocabView():page==='essay'?essayView():reviewView());}
function introduction(eyebrow,title,desc,aside=''){return `<div class="intro"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${aside}</div>`;}
function learnView(){
 const c=cardById[state.cardId],ch=chapters.find(x=>x.id===c.chapter),list=shownCards(c.chapter),index=list.findIndex(x=>x.id===c.id);
 const aside=`<div class="intro-aside"><div><strong>${coreCards.length}</strong><span>核心句型</span></div><div><strong>1–2</strong><span>每义优先用词</span></div></div>`;
 return introduction('LESS IS MORE · 学会用，比背得多更重要','把一套模板，真正用熟。','顺着原讲义学。看懂一句，回忆一句，再换到新题里。',aside)+
 `<div class="mobile-chapters"><label class="quiet" for="chapter-select">学习章节</label><select id="chapter-select" class="select" aria-label="选择学习章节">${chapters.map(x=>`<option value="${x.id}" ${x.id===ch.id?'selected':''}>${x.num} ${x.title}${x.num>3?' · 补充':''}</option>`).join('')}</select></div>
 <div class="path-strip"><div class="flow"><b>${ch.num} ${ch.title}</b><em>/</em><span>${E(ch.subtitle)}</span></div><span class="tag">讲义 p.${ch.pages}</span></div>
 <div class="workspace"><article class="lesson" aria-label="当前句型">
 <div class="lesson-top"><span class="pill ${c.core?'':'extra'}">${c.core?'核心必背':'按题补充'} <span>·</span> ${c.part}</span><span class="quiet">${String(index+1).padStart(2,'0')} / ${String(list.length).padStart(2,'0')}</span></div>
 <div class="lesson-title"><h2>${c.title}</h2><p>${E(c.why)}</p></div>
 <nav class="mode-tabs" aria-label="本句学习方式">${[['explain','01 看懂句型'],['recall','02 遮挡回忆'],['practice','03 点击练习']].map(([id,label])=>`<button data-action="mode" data-id="${id}" class="${mode===id?'active':''}" aria-pressed="${mode===id}">${label}</button>`).join('')}</nav>
 <div class="lesson-body">${mode==='explain'?explainView(c):mode==='recall'?recallView(c):practiceView(c)}</div>
 <div class="lesson-bottom"><button data-action="previous" ${index<=0?'disabled':''}>← 上一句</button><span>讲义 p.${c.page} · ${c.type}</span><button class="primary" data-action="next">${index===list.length-1?'下一章节':'下一句'} →</button></div>
 </article><aside class="side-panel" aria-label="本节句型目录"><div class="section-head"><h3>本节学习清单</h3><button class="small-toggle" data-action="toggle-core">${state.coreOnly?'查看全部':'只看核心'}</button></div><div class="card-list">${list.map((x,i)=>`<button class="card-row ${x.id===c.id?'active':''}" data-action="card" data-id="${x.id}" ${x.id===c.id?'aria-current="true"':''}><span class="index">${String(i+1).padStart(2,'0')}</span><span class="label">${x.title.split('：')[0]}</span><span class="status-dot ${state.progress[x.id]?.level===2?'done':state.progress[x.id]?'wip':''}" aria-label="${state.progress[x.id]?.level===2?'已熟练':state.progress[x.id]?'学习中':'未练习'}"></span></button>`).join('')}</div><div class="side-callout"><strong>这一段，只先想一件事</strong>${ch.hint}<br><br>看过 ≠ 会写。试着不看英文说出主干，再决定是否标记为熟练。</div></aside></div>
 <details class="outline"><summary>顺着讲义，看看本章保留了什么</summary><div class="outline-content">${ch.outline.map(([t,b])=>`<div><b>${t}</b>${E(b)}</div>`).join('')}</div></details>`;
}
function explainView(c){return `<div class="mini-label">你的主句型 / YOUR GO-TO SENTENCE</div><div class="sentence" lang="en">${sentenceHTML(c.en)}</div><p class="translation">${E(c.zh)}</p><div class="breakline"></div><div class="mini-label">怎么套用</div><ol class="howto">${c.steps.map(x=>`<li>${E(x)}</li>`).join('')}</ol><div class="tip"><b>容易写错的地方</b>${E(c.pitfall)}</div><div class="example"><div class="mini-label">放到题目里</div><p class="en" lang="en">${E(c.example)}</p><p class="zh">${E(c.explain)}</p></div>`;}
function ratingButtons(c){return `<div class="ratings"><button data-action="grade" data-id="${c.id}" data-grade="0">还不熟<small>稍后再来</small></button><button data-action="grade" data-id="${c.id}" data-grade="1">想起来了<small>1天后复习</small></button><button data-action="grade" data-id="${c.id}" data-grade="2">很熟练<small>${(state.progress[c.id]?.reps||0)>=2?'7':'3'}天后复习</small></button></div><p class="rating-note">凭刚才的回忆表现评价，不用因为“看懂了”就标记熟练。</p>`;}
function recallView(c){return revealed?`<div class="mini-label">核对一下你的回忆</div><div class="sentence" lang="en">${sentenceHTML(c.en)}</div><p class="translation">${E(c.zh)}</p><div class="tip"><b>一起检查</b>${E(c.pitfall)}</div>${ratingButtons(c)}`:`<div class="recall-zone"><div class="recall-number">Recall before you reveal.</div><div class="prompt">${E(c.zh)}</div><p class="hint">试着说出英文主干。占位部分用中文代替也可以。</p><button class="primary" data-action="reveal">我想好了，查看句型</button></div><p class="rating-note">无需打字 · 先回忆，再核对</p>`;}
function practiceView(c){
 if(!c.q)return `<div class="empty-practice"><div class="mini-label">一句替换练习</div><h3>把这个例句换成另一个主题</h3><p lang="en" class="sentence">${E(c.example)}</p><p>可以先口头说。换主题后，核对主语、时态和动词搭配。</p><button class="primary" data-action="mode" data-id="recall">用中文提示练一遍</button></div>`;
 const q=c.q,done=quizAnswer!==null,correct=quizAnswer===q.answer;
 return `<div class="mini-label">小改动，练会同一句型</div><p class="quiz-prompt">${E(q.prompt)}</p><div class="choices">${q.options.map((x,i)=>`<button class="choice ${done?(i===q.answer?'correct':i===quizAnswer?'wrong':'unselected'):''}" data-action="answer" data-id="${i}" ${done?'disabled':''}><span class="letter">${String.fromCharCode(65+i)}</span>${E(x)}${done&&i===q.answer?' ✓':''}</button>`).join('')}</div>${done?`<div class="feedback ${correct?'':'wrong'}" role="status"><strong>${correct?'答对了，把规则记住。':'这处值得再练一次。'}</strong>${E(q.why)}<br><button data-action="retry">再做一次</button> <button data-action="mode" data-id="recall">遮挡回忆 →</button></div>`:'<p class="rating-note">点击作答，不用输入长句。</p>'}`;
}
function vocabView(){return introduction('A SMALL, USEFUL VOCABULARY','同一个意思，先记一两个。','不用把同义词表背一遍。把常用词和搭配一起记，写作时能直接拿出来。')+`<div class="toolbar">${[['all','全部'],['chart','图表描述'],['reason','原因分析'],['ending','总结措施']].map(([id,n])=>`<button class="filter ${vocabFilter===id?'active':''}" data-action="vocab-filter" data-id="${id}">${n}</button>`).join('')}<button class="filter" data-action="hide-words" aria-pressed="${hideWords}">${hideWords?'显示英文':'遮住英文'}</button><input class="search" id="vocab-search" value="${E(vocabQuery)}" placeholder="搜索意思或单词…" aria-label="搜索词库"></div><div class="vocab-grid" id="vocab-grid">${wordGrid()}</div><section class="aspects"><h2>六大方面，每类先留两个落点。</h2><p>保留讲义的六类结构。个人、社会先用熟，其余按题选；不把抽象好处硬套到任何题目。</p><div class="aspect-grid">${aspects.map(a=>`<article class="aspect"><b>${a[0]}方面</b><p>${a[1]}<span>${a[2]}</span></p><p>${a[3]}<span>${a[4]}</span></p></article>`).join('')}</div></section>`;}
function wordGrid(){const filtered=vocabulary.map((w,i)=>({w,i})).filter(({w})=>(vocabFilter==='all'||w[0]===vocabFilter)&&w.join(' ').toLowerCase().includes(vocabQuery.toLowerCase()));return filtered.length?filtered.map(({w,i})=>`<article class="word-card"><div class="cn"><span>${w[1]}</span><button class="check-word" data-action="word" data-id="${i}" aria-pressed="${state.words.includes(i)}">${state.words.includes(i)?'✓ 已会':'标记已会'}</button></div><div class="word ${hideWords?'hidden-word':''}" lang="en">${hideWords?'先想一想，再点开':E(w[2])}</div>${hideWords?`<button class="small-toggle" data-action="reveal-word" data-id="${i}">显示这一词</button>`:`<div class="form">${E(w[3])}</div><div class="word-example" lang="en">${E(w[4])}</div><p>${E(w[5])}</p>`}</article>`).join(''):'<p class="no-results">没有匹配项，试试“比例”“increase”或其他词。</p>';}
function chartView(e){return `<div class="chart-panel"><div class="mini-label">先读图，再选句型</div><h3>${e.name}</h3><div class="chart-sub">${e.type} · 根据讲义 p.${e.page} 重绘 · 单位：%</div>${e.years?`<div class="legend"><span>${e.years[0]}</span><span>${e.years[1]}</span></div>`:''}<div class="chart-bars">${e.chart.map((a)=>`<div class="bar-group"><div class="bar-label">${a[0]}</div>${a.slice(1).map((v,i)=>`<div class="bar-line ${e.years&&i===0?'first':''}"><div class="bar-track"><i style="width:${v}%"></i></div><span class="bar-value">${v}%</span></div>`).join('')}</div>`).join('')}</div><div class="chart-note">${E(e.note)}</div><div class="chart-note"><b>写完检查这三件事</b><ul class="checklist"><li><label><input type="checkbox">数字、单位、时态正确</label></li><li><label><input type="checkbox">原因能解释本题现象</label></li><li><label><input type="checkbox">措施明确到谁做什么</label></li></ul></div></div>`;}
function wordCount(t){return (t.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*(?:\.[0-9]+)?%?/g)||[]).length;}
function essayView(){const e=essays.find(x=>x.id===essayId),wc=wordCount(e.paragraphs.join(' '));return introduction('FROM SENTENCES TO AN ESSAY','把句子连起来，才是你的模板。','先看图和中文提纲，尝试口头组织一遍，再展开示范。每篇选合适句型，不必把15句全部塞进去。')+`<div class="toolbar">${essays.map(x=>`<button class="filter ${essayId===x.id?'active':''}" data-action="essay-topic" data-id="${x.id}">${x.type} · ${x.name}</button>`).join('')}</div><div class="essay-layout">${chartView(e)}<article class="essay-paper"><div class="essay-paper-head"><h3>${essayOutline?'先搭三段骨架':'完整套用示范'}</h3><span>${essayOutline?'自己想一遍，再看答案':`约 ${wc} 词 · 本站整理`}</span></div>${e.paragraphs.map((p,i)=>`<section class="essay-block"><div class="paragraph-label">PARAGRAPH ${i+1} · ${['描述与概括','分析与解释','总结与措施'][i]}</div>${essayOutline?`<div class="outline-prompt">${E(e.prompts[i])}</div>`:`<p class="essay-en" lang="en">${E(p)}</p>`}<p class="essay-map">调用思路：${E(e.map[i])}</p></section>`).join('')}<div class="essay-actions"><button class="primary" data-action="essay-toggle">${essayOutline?'我想好了，看完整示范':'收起英文，重新练'}</button><button data-action="copy-essay">复制示范</button><button data-action="print">打印这一页</button></div><label class="field-label" for="essay-notes">我的替换草稿 / 卡住的地方</label><textarea class="text-notes" id="essay-notes" placeholder="可写关键词，也可粘贴自己写的段落。这里保存草稿，不作自动批改。">${E(state.notes[e.id]||'')}</textarea><p class="content-notice">先替换主题，再核对主谓与时态。约150词为本页练习目标；实际写作按题面要求。</p></article></div>`;}
function nextQueue(){const due=cards.filter(c=>state.progress[c.id]&&state.progress[c.id].due<=Date.now()).sort((a,b)=>state.progress[a.id].due-state.progress[b.id].due);const fresh=coreCards.filter(c=>!state.progress[c.id]);return [...due,...fresh].slice(0,5).map(c=>c.id);}
function reviewView(){
 if(review)return activeReviewView();const s=stats(),queue=nextQueue(),mistakeCards=cards.filter(c=>state.mistakes[c.id]>0);
 return introduction('A LITTLE PRACTICE, EVERY DAY','少量回忆，让句型留下来。','每轮最多5句。先处理到期句型，再补未练过的核心句；今天看过不等于今天会了。')+
 `<div class="review-summary"><div class="summary-tile"><span>核心已熟练</span><b>${s.mastered}<small> / ${coreCards.length}</small></b><span>以你的回忆评价为准</span></div><div class="summary-tile"><span>当前待复习</span><b>${s.due}</b><span>到期或标记“还不熟”</span></div><div class="summary-tile"><span>核心已练过</span><b>${s.learned}</b><span>从第一次主动回忆开始</span></div></div>
 <section class="review-launch"><div><h2>${queue.length?'给自己一轮轻量练习。':'今天的到期任务完成了。'}</h2><p>${queue.length?`这轮 ${queue.length} 句 · 无需打字 · 预计3–5分钟`:'可以继续巩固，或到“整篇套用”试着组织文章。'}</p></div><button class="primary" data-action="start-review">${queue.length?'开始这一轮 →':'巩固核心句型 →'}</button></section>
 ${mistakeCards.length?`<details class="outline"><summary>点击练习中出错的句型 · ${mistakeCards.length} 项</summary><div class="progress-list">${mistakeCards.map(c=>progressRow(c,true)).join('')}</div></details>`:''}
 <div class="section-head" style="margin-top:25px"><h3>我的15句核心模板</h3><span class="quiet">回忆之后，进度才会变化</span></div><div class="progress-list">${coreCards.map(c=>progressRow(c)).join('')}</div>
 <details class="outline"><summary>接下来怎么学 · 对应讲义3.6</summary><div class="outline-content"><div><b>第一步 · 一次只学3–5句</b>看中文，回忆主干，能说出再核对。用点击题检查常见语法错误。</div><div><b>第二步 · 一次换一个地方</b>先换主题，再换数据，最后才调整原因与措施。不要同时改太多内容。</div><div><b>第三步 · 每种图写一篇</b>按静态、动态、双图表逐步套用。之后再补图画、文字开头。</div><div><b>第四步 · 固定自己的选择</b>主句型稳定后，才补选学表达。每次练习只修正真正卡住的部分。</div></div></details>
 <div class="storage-note"><p>学习记录和草稿保存在当前浏览器，不会自动跨设备同步。换手机或清理浏览器前，先导出；在另一台设备导入即可继续。复习间隔采用简单的1 / 3 / 7天规则。</p><button data-action="export">导出进度</button><button data-action="import">导入进度</button><button data-action="reset">清空学习记录</button></div>`;
}
function progressRow(c,isMistake=false){const p=state.progress[c.id];let label='还没开始';if(p){label=p.level===2?'已熟练':p.level===1?'学习中':'需要再练';label+=' · '+(p.due<=Date.now()?'现在可复习':'下次 '+new Date(p.due).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}));}return `<div class="progress-row"><span>${c.id.slice(1)}</span><div class="grow">${c.title}<small>${isMistake?`本题尚待纠正 · 累计错误 ${state.mistakes[c.id]} 次`:label}</small></div><button data-action="${isMistake?'practice-card':'recall-card'}" data-id="${c.id}">${isMistake?'再练':'回忆'}</button></div>`;}
function activeReviewView(){
 if(review.index>=review.ids.length){const mastered=review.results.filter(x=>x.level===2).length;return `<div class="review-active"><div class="review-complete"><div class="complete-mark">✓</div><div class="eyebrow">ONE SMALL STEP, WELL DONE</div><h2>这一轮，练完了。</h2><p>回忆 ${review.ids.length} 句 · ${mastered} 句标记熟练<br>还不熟的句型已留在待复习中。</p><button class="primary" data-action="finish-review">回到复习记录 →</button></div><p class="timer-note">现在可以停下来，也可以用刚才的句型组织一小段。</p></div>`;}
 const c=cardById[review.ids[review.index]];return `<div class="review-active"><div class="review-topline"><span>本轮回忆 ${review.index+1} / ${review.ids.length}</span><button class="small-toggle" data-action="finish-review">结束本轮</button></div><div class="meter" style="margin-bottom:22px"><i style="width:${review.index/review.ids.length*100}%"></i></div><article class="lesson"><div class="lesson-top"><span class="pill">${chapters.find(ch=>ch.id===c.chapter).title}</span><span class="quiet">p.${c.page}</span></div><div class="lesson-title"><h2>${c.title}</h2></div><div class="lesson-body">${recallView(c)}</div></article></div>`;
}
function changeChapter(id){const first=shownCards(id)[0];if(first)openCard(first.id);}
function advance(dir){const c=cardById[state.cardId],list=shownCards(c.chapter),i=list.findIndex(x=>x.id===c.id);if(list[i+dir]){state.cardId=list[i+dir].id;save();mode='explain';revealed=false;quizAnswer=null;render();}else if(dir>0){const ci=chapters.findIndex(x=>x.id===c.chapter);if(chapters[ci+1])changeChapter(chapters[ci+1].id);else goPage('review');}const lesson=document.querySelector('.lesson');if(lesson&&window.innerWidth<920)lesson.scrollIntoView({block:'start',behavior:'smooth'});}
async function copyText(text){try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(text);toast('已复制，可以粘贴到笔记里。');}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();toast(ok?'已复制。':'复制未成功，请展开示范后手动选择文字。');}}
document.addEventListener('click',event=>{
 const el=event.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action,id=el.dataset.id;
 if(a==='page')return goPage(id);
 if(a==='chapter')return changeChapter(id);
 if(a==='card')return openCard(id);
 if(a==='recall-card')return openCard(id,'recall');
 if(a==='practice-card')return openCard(id,'practice');
 if(a==='mode'){mode=id;revealed=false;quizAnswer=null;render();}
 if(a==='reveal'){revealed=true;render();}
 if(a==='grade')grade(id,Number(el.dataset.grade));
 if(a==='next')advance(1);
 if(a==='previous')advance(-1);
 if(a==='toggle-core'){state.coreOnly=!state.coreOnly;const c=cardById[state.cardId];if(!shownCards(c.chapter).some(x=>x.id===c.id))state.cardId=shownCards(c.chapter)[0].id;save();render();}
 if(a==='answer'){quizAnswer=Number(id);const c=cardById[state.cardId];if(quizAnswer!==c.q.answer){state.mistakes[c.id]=(state.mistakes[c.id]||0)+1;}else{delete state.mistakes[c.id];}save();render();}
 if(a==='retry'){quizAnswer=null;render();}
 if(a==='vocab-filter'){vocabFilter=id;render();}
 if(a==='hide-words'){hideWords=!hideWords;render();}
 if(a==='word'){const i=Number(id);state.words=state.words.includes(i)?state.words.filter(v=>v!==i):[...state.words,i];save();render();}
 if(a==='reveal-word'){const w=vocabulary[Number(id)],article=el.closest('.word-card');article.querySelector('.word').textContent=w[2];article.querySelector('.word').classList.remove('hidden-word');el.outerHTML=`<div class="form">${E(w[3])}</div><div class="word-example" lang="en">${E(w[4])}</div><p>${E(w[5])}</p>`;}
 if(a==='essay-topic'){essayId=id;essayOutline=true;render();}
 if(a==='essay-toggle'){essayOutline=!essayOutline;render();}
 if(a==='copy-essay')copyText(essays.find(x=>x.id===essayId).paragraphs.join('\n\n'));
 if(a==='print'){essayOutline=false;render();window.print();}
 if(a==='start-review'){let ids=nextQueue();if(!ids.length)ids=[...coreCards].sort((a,b)=>(state.progress[a.id]?.last||0)-(state.progress[b.id]?.last||0)).slice(0,5).map(c=>c.id);review={ids,index:0,results:[]};revealed=false;render();window.scrollTo({top:0,behavior:'smooth'});}
 if(a==='finish-review'){review=null;render();}
 if(a==='export'){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`essay-progress-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('进度备份已生成，导入后可在另一设备继续。');}
 if(a==='import')document.getElementById('import-file').click();
 if(a==='reset' && window.confirm('清空当前浏览器的学习记录、词汇标记和草稿？这不会影响已经导出的备份。')){state=defaultState();save();render();toast('已清空，可以重新开始。');}
});
document.addEventListener('change',event=>{if(event.target.id==='chapter-select')changeChapter(event.target.value);});
document.addEventListener('input',event=>{
 if(event.target.id==='vocab-search'){vocabQuery=event.target.value;document.getElementById('vocab-grid').innerHTML=wordGrid();}
 if(event.target.id==='essay-notes'){state.notes[essayId]=event.target.value;save();}
});
document.getElementById('import-file').addEventListener('change',async event=>{
 const input=event.target,file=input.files[0];if(!file)return;
 try{if(file.size>1024*1024)throw new Error('文件过大，请选择本页导出的进度文件');const next=validateState(JSON.parse(await file.text()));if(!window.confirm('用此备份替换当前浏览器的学习记录和草稿？'))return;state=next;save();review=null;render();toast('进度已导入，可以继续学习。');}catch(error){toast('导入失败：'+(error.message||'请检查文件格式'));}finally{input.value='';}
});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(['learn','vocab','essay','review'].includes(p)){page=p;review=null;render();}});
window.addEventListener('storage',event=>{if(event.key===STORAGE && event.newValue){try{state=validateState(JSON.parse(event.newValue));if(!document.activeElement?.matches('textarea,input'))render();}catch{}}});
render();
