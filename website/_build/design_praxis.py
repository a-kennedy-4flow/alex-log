# -*- coding: utf-8 -*-
"""Design 3 "Praxis". Built for the visitor who wants an appointment today.
The booking panel sits in the first screen. Every treatment is on one page
behind a search box. Light and dark are both supported."""
import os
from util import esc, write, img, alt_for
import content as C

NAME = "praxis"
TITLE = "Praxis"
TAGLINE = "Terminpanel im ersten Bild. Alle Behandlungen durchsuchbar. Hell und dunkel."

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">')

CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#F6F8F8; --card:#FFFFFF; --card2:#F0F4F4;
  --ink:#0E1B1E; --muted:#586A6E; --line:#DFE6E6; --line2:#EDF1F1;
  --brand:#0F6B75; --brand2:#0A4F58; --brand-s:#E4F0F1;
  --accent:#9D5932; --accent-s:#F8EDE6; --ok:#2C7A45;
  --r:10px; --r-l:16px;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --wrap:1200px;
}
html[data-theme="dark"]{
  --bg:#0C1416; --card:#121D20; --card2:#172528;
  --ink:#E7EEEE; --muted:#8FA1A5; --line:#202F33; --line2:#1A2629;
  --brand:#54B7C2; --brand2:#7ACCD5; --brand-s:#12292D;
  --accent:#D68B5C; --accent-s:#2A1D15; --ok:#5BBF7C;
}
html{scroll-behavior:smooth;scroll-padding-top:78px}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.65 var(--sans);
  -webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:var(--brand);text-underline-offset:3px}
h1,h2,h3,h4{margin:0;font-weight:600;line-height:1.2;letter-spacing:-.018em}
.wrap{width:min(var(--wrap),calc(100% - 40px));margin-inline:auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.lbl{font:500 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.lbl.brand{color:var(--brand)}

/* ---- buttons ---- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--r);
  padding:12px 20px;font:600 15px/1 var(--sans);text-decoration:none;border:1px solid transparent;
  cursor:pointer;transition:background .16s,border-color .16s,color .16s}
.btn-p{background:var(--brand);color:#fff}
.btn-p:hover{background:var(--brand2);color:#fff}
html[data-theme="dark"] .btn-p{color:#08191C}
.btn-s{background:var(--card);color:var(--ink);border-color:var(--line)}
.btn-s:hover{border-color:var(--brand);color:var(--brand)}
.btn-sm{padding:9px 14px;font-size:14px}
.btn-full{width:100%}

/* ---- header ---- */
.hd{position:sticky;top:0;z-index:60;background:var(--bg);border-bottom:1px solid var(--line)}
.hd-in{display:flex;align-items:center;gap:20px;min-height:66px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex:0 0 auto}
.logo img{height:36px;width:auto}
html[data-theme="dark"] .logo img{filter:invert(1) hue-rotate(180deg) saturate(1.15) brightness(1.06)}
.nav{display:flex;gap:2px;margin-left:auto}
.nav a{padding:8px 12px;border-radius:8px;font:500 14px/1 var(--sans);color:var(--muted);
  text-decoration:none;white-space:nowrap;transition:.15s}
.nav a:hover{background:var(--card);color:var(--ink)}
.nav a[aria-current="page"]{background:var(--brand-s);color:var(--brand)}
.hd-act{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.icobtn{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--card);
  color:var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s}
.icobtn:hover{color:var(--brand);border-color:var(--brand)}
.burger{display:none}
.mob{display:none;border-top:1px solid var(--line);padding:10px 0 18px}
.mob a{display:block;padding:11px 2px;border-bottom:1px solid var(--line2);font:500 15px/1 var(--sans);
  color:var(--ink);text-decoration:none}
.mob a.sub{padding-left:18px;color:var(--muted);font-size:14px}
.hd[data-mob] .mob{display:block}

/* ---- hero ---- */
.hero{padding:44px 0 52px}
.hero-g{display:grid;grid-template-columns:1fr 424px;gap:56px;align-items:start}
.hero h1{font-size:clamp(31px,3.9vw,45px);margin:14px 0 18px;letter-spacing:-.028em}
.hero>.hero-g>div>p.sub{font-size:18px;color:var(--muted);margin:0 0 30px;max-width:50ch}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:var(--r-l);overflow:hidden;margin-bottom:30px}
.facts div{background:var(--card);padding:18px 20px}
.facts dt{font:500 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
.facts dd{margin:0;font:600 16px/1.35 var(--sans)}
.quick{margin:0}
.quick p{margin:0 0 12px}
.quicklinks{display:flex;flex-wrap:wrap;gap:8px}
.quicklinks a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:8px 14px;
  font:500 14px/1 var(--sans);color:var(--ink);text-decoration:none;transition:.15s}
.quicklinks a:hover{border-color:var(--brand);color:var(--brand)}
.who{display:flex;align-items:center;gap:16px;margin-top:30px;padding-top:24px;border-top:1px solid var(--line)}
.who img{width:60px;height:60px;border-radius:50%;object-fit:cover;flex:0 0 auto}
.who strong{display:block;font:600 16px/1.3 var(--sans);margin-bottom:4px}
.who span{display:block;font-size:14px;color:var(--muted)}

/* ---- booking panel ---- */
.book{background:var(--card);border:1px solid var(--line);border-radius:var(--r-l);
  padding:24px 24px 26px;position:sticky;top:86px}
.book h2{font-size:19px;margin:0 0 4px}
.book>p{margin:0 0 20px;font-size:14px;color:var(--muted)}
.f{margin-bottom:14px}
.f label{display:block;font:500 13px/1 var(--sans);margin-bottom:7px}
.f input,.f select,.f textarea{width:100%;background:var(--bg);border:1px solid var(--line);
  border-radius:var(--r);padding:11px 13px;font:400 15px/1.4 var(--sans);color:var(--ink)}
.f textarea{min-height:92px;resize:vertical}
.f input:focus,.f select:focus,.f textarea:focus{outline:0;border-color:var(--brand);
  box-shadow:0 0 0 3px var(--brand-s)}
.f-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.book .btn{margin-top:6px}
.book-alt{margin-top:16px;padding-top:16px;border-top:1px solid var(--line2);
  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--muted)}
.book-alt a{font-weight:600;text-decoration:none}

/* ---- steps ---- */
.sec{padding:56px 0}
.sec-alt{background:var(--card);border-block:1px solid var(--line)}
.sec-hd{margin-bottom:28px;max-width:62ch}
.sec-hd h2{font-size:clamp(23px,2.6vw,31px);margin:10px 0 10px}
.sec-hd p{margin:0;color:var(--muted)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.step{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-l);padding:22px 24px}
.sec-alt .step{background:var(--card2)}
.step b{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
  border-radius:8px;background:var(--brand);color:#fff;font:600 14px/1 var(--sans);margin-bottom:14px}
html[data-theme="dark"] .step b{color:#08191C}
.step h3{font-size:17px;margin:0 0 8px}
.step p{margin:0;font-size:15px;color:var(--muted)}

/* ---- catalogue ---- */
.cat-tools{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin-bottom:18px}
.search{position:relative}
.search input{width:100%;background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:13px 15px 13px 42px;font:400 15px/1.4 var(--sans);color:var(--ink)}
.search input:focus{outline:0;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-s)}
.search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted)}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tab{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 15px;
  font:500 14px/1 var(--sans);color:var(--muted);cursor:pointer;transition:.15s;white-space:nowrap}
.tab:hover{color:var(--ink)}
.tab[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}
html[data-theme="dark"] .tab[aria-pressed="true"]{color:#08191C}
.cat-count{font:500 13px/1 var(--mono);color:var(--muted);margin-bottom:14px}
.cat{border:1px solid var(--line);border-radius:var(--r-l);overflow:hidden;background:var(--card)}
.row{border-bottom:1px solid var(--line2)}
.row:last-child{border-bottom:0}
.row[hidden]{display:none}
.row>button{width:100%;display:grid;grid-template-columns:64px 1fr auto;gap:16px;align-items:center;
  background:none;border:0;cursor:pointer;padding:14px 18px;text-align:left;color:inherit;font:inherit}
.row>button:hover{background:var(--card2)}
.row img{width:64px;height:48px;object-fit:cover;border-radius:7px}
.row-t{min-width:0}
.row-t strong{display:block;font:600 16px/1.3 var(--sans);margin-bottom:3px}
.row-t span{display:block;font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.row .chev{color:var(--muted);transition:transform .2s}
.row[data-open] .chev{transform:rotate(180deg)}
.row-p{display:none;padding:0 18px 22px 98px}
.row[data-open] .row-p{display:block}
.row-p p{margin:0 0 14px;font-size:15px;color:var(--muted);max-width:74ch}
.row-p .tags{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 16px}
.row-p .tags span{background:var(--brand-s);color:var(--brand);border-radius:999px;padding:5px 11px;
  font:500 12px/1 var(--sans)}
.row-acts{display:flex;gap:10px;flex-wrap:wrap}
.cat-empty{padding:44px 20px;text-align:center;color:var(--muted);font-size:15px}

/* ---- info grid ---- */
.info{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.icard{background:var(--card);border:1px solid var(--line);border-radius:var(--r-l);padding:24px 26px}
.sec-alt .icard{background:var(--card2)}
.icard h3{font-size:17px;margin:12px 0 12px}
.icard address,.icard p{font-style:normal;margin:0;font-size:15px;color:var(--muted);line-height:1.75}
.icard a{font-weight:600;text-decoration:none}
.icard .btn{margin-top:16px}

/* ---- faq ---- */
.faq{border:1px solid var(--line);border-radius:var(--r-l);overflow:hidden;background:var(--card)}
.faq details{border-bottom:1px solid var(--line2)}
.faq details:last-child{border-bottom:0}
.faq summary{cursor:pointer;padding:16px 20px;font:600 16px/1.4 var(--sans);list-style:none;
  display:flex;justify-content:space-between;gap:14px;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--brand);font-size:20px;font-weight:400;line-height:1}
.faq details[open] summary::after{content:"–"}
.faq summary:hover{background:var(--card2)}
.faq p{margin:0;padding:0 20px 20px;color:var(--muted);font-size:15px;max-width:78ch}

/* ---- interior ---- */
.phead{border-bottom:1px solid var(--line);padding:26px 0 30px;background:var(--card)}
.crumb{font:500 12px/1 var(--mono);color:var(--muted);margin-bottom:14px}
.crumb a{text-decoration:none}
.phead h1{font-size:clamp(27px,3.4vw,38px);margin:0 0 10px}
.phead p{margin:0;color:var(--muted);max-width:62ch}
.doc{display:grid;grid-template-columns:1fr 340px;gap:44px;align-items:start;padding:44px 0 60px}
.art section{background:var(--card);border:1px solid var(--line);border-radius:var(--r-l);
  padding:26px 28px;margin-bottom:18px}
.art h2{font-size:23px;margin:0 0 8px}
.art .lbl{margin-bottom:14px;display:block}
.art p{margin:0 0 14px;color:var(--muted);max-width:74ch}
.art figure{margin:0 0 20px;border-radius:var(--r);overflow:hidden}
.art figure img{width:100%;aspect-ratio:16/7;object-fit:cover}
.art .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.art .tags span{background:var(--brand-s);color:var(--brand);border-radius:999px;padding:5px 11px;
  font:500 12px/1 var(--sans)}
.aside{position:sticky;top:86px;display:grid;gap:16px}

/* ---- news ---- */
.news{display:grid;gap:18px;padding:44px 0 60px}
.news article{background:var(--card);border:1px solid var(--line);border-radius:var(--r-l);
  display:grid;grid-template-columns:260px 1fr;overflow:hidden}
.news img{width:100%;height:100%;object-fit:cover;min-height:200px}
.news-b{padding:26px 28px}
.news h2{font-size:22px;margin:10px 0 10px}
.news p{margin:0 0 12px;color:var(--muted);font-size:15px}
.tarif{display:inline-block;background:var(--accent-s);color:var(--accent);border-radius:999px;
  padding:5px 12px;font:600 13px/1 var(--sans);margin-bottom:12px}
.dates{margin:16px 0;border-top:1px solid var(--line2)}
.dates div{padding:12px 0;border-bottom:1px solid var(--line2)}
.dates b{display:block;font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;
  color:var(--accent);margin-bottom:6px}
.dates span{font-size:14px;color:var(--muted)}

/* ---- legal ---- */
.legal{max-width:74ch;padding:44px 0 70px}
.legal h1{font-size:clamp(27px,3.4vw,38px);margin:0 0 22px}
.legal h2{font-size:19px;margin:32px 0 10px}
.legal p,.legal address{color:var(--muted);font-style:normal;margin:0 0 14px}
.legal dl{display:grid;grid-template-columns:auto 1fr;gap:9px 20px;margin:0 0 14px}
.legal dt{font-weight:600}
.legal dd{margin:0;color:var(--muted)}

/* ---- footer ---- */
.ft{background:var(--card);border-top:1px solid var(--line);padding:44px 0 22px}
.ft-g{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:34px;padding-bottom:34px}
.ft img{height:34px;width:auto;margin-bottom:14px}
html[data-theme="dark"] .ft img{filter:invert(1) hue-rotate(180deg) saturate(1.15) brightness(1.06)}
.ft p{margin:0;font-size:14px;color:var(--muted);max-width:32ch}
.ft h4{font:500 11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.ft a{font-size:14px;color:var(--ink);text-decoration:none}
.ft a:hover{color:var(--brand)}
.ft-b{border-top:1px solid var(--line2);padding-top:18px;display:flex;justify-content:space-between;
  gap:14px;flex-wrap:wrap;font-size:13px;color:var(--muted)}

/* ---- mobile call bar ---- */
.callbar{display:none;position:fixed;left:0;right:0;bottom:0;z-index:70;background:var(--card);
  border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));
  gap:10px}
.callbar .btn{flex:1}

@media(max-width:1040px){
  .nav{display:none}
  .burger{display:inline-flex}
  .hero-g,.doc{grid-template-columns:1fr;gap:30px}
  .book,.aside{position:static}
  .facts,.steps,.info{grid-template-columns:1fr 1fr}
  .ft-g{grid-template-columns:1fr 1fr}
  .news article{grid-template-columns:1fr}
}
@media(max-width:680px){
  .hd-act>.btn{display:none}
  .wrap{width:calc(100% - 30px)}
  .facts,.steps,.info,.cat-tools,.f-2{grid-template-columns:1fr}
  .ft-g{grid-template-columns:1fr}
  .row>button{grid-template-columns:44px 1fr auto;gap:12px;padding:13px 14px}
  .row img{width:44px;height:44px}
  .row-p{padding:0 14px 20px 14px}
  .callbar{display:flex}
  body{padding-bottom:72px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}html{scroll-behavior:auto}}
"""

JS = """
(function(){
  /* Theme. The stored choice wins over the system setting. */
  var root=document.documentElement;
  var saved=null;
  try{saved=localStorage.getItem('sn-theme')}catch(e){}
  if(saved){root.setAttribute('data-theme',saved)}
  var tb=document.getElementById('theme');
  if(tb){tb.addEventListener('click',function(){
    var dark=root.getAttribute('data-theme')==='dark'
      ||(!root.getAttribute('data-theme')&&window.matchMedia('(prefers-color-scheme:dark)').matches);
    var next=dark?'light':'dark';
    root.setAttribute('data-theme',next);
    try{localStorage.setItem('sn-theme',next)}catch(e){}
    tb.setAttribute('aria-label',next==='dark'?'Helle Ansicht':'Dunkle Ansicht');
  });}

  var hd=document.querySelector('.hd'),burger=document.querySelector('.burger');
  if(burger){burger.addEventListener('click',function(){
    var open=hd.hasAttribute('data-mob');
    if(open){hd.removeAttribute('data-mob')}else{hd.setAttribute('data-mob','')}
    burger.setAttribute('aria-expanded',String(!open));
  });}

  /* One row opens at a time. Clicking the open row closes it. */
  document.querySelectorAll('.row>button').forEach(function(b){
    b.addEventListener('click',function(){
      var row=b.parentNode,open=row.hasAttribute('data-open');
      if(open){row.removeAttribute('data-open')}else{row.setAttribute('data-open','')}
      b.setAttribute('aria-expanded',String(!open));
    });
  });

  /* Catalogue. The search box and the category buttons narrow the same list. */
  var q=document.getElementById('cat-q');
  var tabs=document.querySelectorAll('.tab');
  var rows=document.querySelectorAll('.row[data-cat]');
  var count=document.getElementById('cat-count');
  var none=document.getElementById('cat-empty');
  function apply(){
    var term=(q&&q.value||'').trim().toLowerCase();
    var cat='alle';
    tabs.forEach(function(t){if(t.getAttribute('aria-pressed')==='true'){cat=t.dataset.cat}});
    var shown=0;
    rows.forEach(function(r){
      var okCat=cat==='alle'||r.dataset.cat===cat;
      var okTerm=!term||r.dataset.hay.indexOf(term)>-1;
      var ok=okCat&&okTerm;
      r.hidden=!ok;
      if(ok){shown++}else{r.removeAttribute('data-open')}
    });
    if(count){count.textContent=shown+' von '+rows.length+' Behandlungen'}
    if(none){none.hidden=shown>0}
  }
  if(q){q.addEventListener('input',apply)}
  tabs.forEach(function(t){t.addEventListener('click',function(){
    tabs.forEach(function(o){o.setAttribute('aria-pressed',String(o===t))});apply();
  })});
  apply();

  function openFromHash(){
    var id=location.hash.slice(1);
    if(!id)return;
    var row=document.getElementById(id);
    if(!row||!row.classList.contains('row'))return;
    row.hidden=false;
    row.setAttribute('data-open','');
    var b=row.querySelector('button');
    if(b){b.setAttribute('aria-expanded','true')}
    row.scrollIntoView({block:'center'});
  }
  window.addEventListener('hashchange',openFromHash);
  openFromHash();

  /* The booking panel carries the treatment named in the link. */
  document.querySelectorAll('[data-book]').forEach(function(a){
    a.addEventListener('click',function(){
      var sel=document.getElementById('anliegen');
      if(sel){
        for(var i=0;i<sel.options.length;i++){
          if(sel.options[i].value===a.dataset.book){sel.selectedIndex=i;break}
        }
      }
    });
  });
})();
"""

SEARCH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
CHEV = '<svg class="chev" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
BURGER = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
SUN = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/></svg>'
PHONE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>'
PIN = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>'
CLOCK = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>'
DOC = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg>'

CATS = [("alle", "Alle"), ("therapien", "Therapien"), ("manuelle-therapien", "Manuelle Therapien"),
        ("infusionstherapien", "Infusionstherapien"), ("faszien-therapie", "Faszien"),
        ("wellness-massagen", "Wellness"), ("aesthetische-medizin", "Ästhetik")]

STEPS = [("Anfragen", "Termin über das Formular oder telefonisch anfragen. Ich melde mich zurück."),
         ("Erstgespräch", "Eine Stunde. Wir gehen Ihre Beschwerden und Ihre Vorgeschichte durch."),
         ("Therapieplan", "Ich schlage eine Therapieform vor. Bei gleicher Symptomatik kann sie "
                          "von Patient zu Patient verschieden sein.")]

FAQ = [("Übernimmt die Krankenkasse die Kosten?",
        "Als Heilpraktikerin rechne ich privat ab. Gesetzliche Kassen erstatten Heilpraktikerleistungen "
        "in der Regel nicht. Viele private Kassen und Zusatzversicherungen tun es. Fragen Sie vor dem "
        "ersten Termin bei Ihrer Versicherung nach."),
       ("Wie lange dauert ein Termin?",
        "Der erste Termin dauert eine Stunde. Folgetermine richten sich nach der gewählten Therapieform."),
       ("Behandeln Sie meine Beschwerde oder mein Symptom?",
        "Ich behandle nicht die Symptome oder die Krankheit, sondern Menschen. Bei gleicher Symptomatik "
        "zweier Patienten finden durchaus zwei verschiedene Therapien Anwendung, wenn die Ursache des "
        "Problems eine andere ist."),
       ("Ersetzt eine Naturheilbehandlung den Arzt?",
        "Nein. Eine ärztliche Diagnose und eine laufende Behandlung bespreche ich mit Ihnen. Bringen Sie "
        "vorhandene Befunde zum ersten Termin mit.")]


def nav_html(cur):
    out = []
    for slug, label, kids in C.NAV:
        a = ' aria-current="page"' if slug == cur else ""
        out.append('<a href="%s.html"%s>%s</a>' % (slug, a, esc(label)))
    return '<nav class="nav" aria-label="Hauptmenü">%s</nav>' % "".join(out)


def mob_html():
    out = []
    for slug, label, kids in C.NAV:
        out.append('<a href="%s.html">%s</a>' % (slug, esc(label)))
        for k, v in kids:
            out.append('<a class="sub" href="%s.html">%s</a>' % (k, esc(v)))
    return '<div class="mob"><div class="wrap">%s</div></div>' % "".join(out)


def header(cur):
    p = C.PRACTICE
    return ('<header class="hd"><div class="wrap hd-in">'
            '<a class="logo" href="index.html"><img src="%s" alt="%s"></a>%s'
            '<div class="hd-act">'
            '<button class="icobtn" id="theme" type="button" aria-label="Dunkle Ansicht">%s</button>'
            '<a class="btn btn-s btn-sm" href="tel:%s">%s %s</a>'
            '<a class="btn btn-p btn-sm" href="kontakt.html">Termin anfragen</a>'
            '<button class="icobtn burger" type="button" aria-expanded="false" aria-label="Menü öffnen">%s</button>'
            '</div></div>%s</header>'
            ) % (img("sanare-naturalis.jpg"), esc(alt_for("sanare-naturalis.jpg")), nav_html(cur),
                 SUN, p["phone_link"], PHONE, esc(p["phone"]), BURGER, mob_html())


def callbar():
    p = C.PRACTICE
    return ('<div class="callbar"><a class="btn btn-s" href="tel:%s">%s Anrufen</a>'
            '<a class="btn btn-p" href="kontakt.html">Termin anfragen</a></div>') % (p["phone_link"], PHONE)


def footer():
    p = C.PRACTICE
    ther = "".join('<li><a href="%s.html">%s</a></li>' % (k, esc(v)) for k, v in C.NAV[1][2])
    return ('<footer class="ft"><div class="wrap"><div class="ft-g">'
            '<div><img src="%s" alt="%s"><p>Naturheilpraxis in Krefeld. %s, %s.</p></div>'
            '<div><h4>Therapien</h4><ul>%s<li><a href="wellness-massagen.html">Wellness-Massagen</a></li>'
            '<li><a href="aesthetische-medizin.html">Ästhetische Medizin</a></li></ul></div>'
            '<div><h4>Praxis</h4><ul><li><a href="therapien.html">Alle Behandlungen</a></li>'
            '<li><a href="aktuelles.html">Aktuelles</a></li><li><a href="kontakt.html">Kontakt</a></li>'
            '<li><a href="impressum.html">Impressum</a></li></ul></div>'
            '<div><h4>Kontakt</h4><ul><li>%s</li><li>%s %s</li><li><a href="tel:%s">%s</a></li></ul></div>'
            '</div><div class="ft-b"><span>© 2026 %s</span><span>%s · %s</span></div></div></footer>'
            ) % (img("sanare-naturalis.jpg"), esc(alt_for("sanare-naturalis.jpg")),
                 esc(p["practitioner"]), esc(p["role"]), ther,
                 esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                 p["phone_link"], esc(p["phone"]), esc(p["name"]), esc(p["practitioner"]), esc(p["licensed"]))


def shell(cur, title, desc, body):
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta name="color-scheme" content="light dark">'
            '<title>%s</title><meta name="description" content="%s">'
            '<link rel="icon" href="%s">%s<link rel="stylesheet" href="style.css">'
            '<script>try{var t=localStorage.getItem("sn-theme");if(t)'
            'document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>'
            '</head><body><a class="sr" href="#main">Zum Inhalt springen</a>%s'
            '<main id="main">%s</main>%s%s<script src="main.js"></script></body></html>'
            ) % (esc(title), esc(desc), img("sanare-naturalis.jpg"), FONTS,
                 header(cur), body, footer(), callbar())


def booking_panel():
    opts = "".join('<option value="%s">%s</option>' % (esc(t["heading"]), esc(t["heading"]))
                   for t in C.all_treatments())
    return ('<form class="book" method="post" action="#">'
            '<h2>Termin anfragen</h2><p>Ich melde mich zurück. Meist noch am selben Tag.</p>'
            '<div class="f"><label for="anliegen">Anliegen</label>'
            '<select id="anliegen" name="anliegen"><option value="">Noch offen — bitte beraten</option>%s</select></div>'
            '<div class="f-2"><div class="f"><label for="name">Name</label>'
            '<input id="name" name="name" type="text" required></div>'
            '<div class="f"><label for="tel">Telefon</label><input id="tel" name="tel" type="tel"></div></div>'
            '<div class="f"><label for="email">E-Mail</label><input id="email" name="email" type="email" required></div>'
            '<div class="f"><label for="zeit">Wunschzeit</label>'
            '<select id="zeit" name="zeit"><option>Vormittags</option><option>Nachmittags</option>'
            '<option>Abends</option><option>Egal</option></select></div>'
            '<div class="f"><label for="nachricht">Nachricht</label>'
            '<textarea id="nachricht" name="nachricht"></textarea></div>'
            '<button class="btn btn-p btn-full" type="submit">Anfrage senden</button>'
            '<div class="book-alt"><span>Lieber telefonisch?</span>'
            '<a href="tel:%s">%s</a></div></form>') % (opts, C.PRACTICE["phone_link"], esc(C.PRACTICE["phone"]))

# ---------------------------------------------------------------- pages
def catalogue(limit=None):
    ts = C.all_treatments()
    if limit:
        ts = ts[:limit]
    tabs = "".join('<button class="tab" type="button" data-cat="%s" aria-pressed="%s">%s</button>'
                   % (k, "true" if k == "alle" else "false", esc(v)) for k, v in CATS)
    rows = []
    for t in ts:
        hay = " ".join(t["tags"] + [t["heading"], t["page"], t["blurb"]]).lower()
        tags = "".join("<span>%s</span>" % esc(x) for x in t["tags"])
        # A row in the Therapien group holds its whole text already. It links on
        # to the sub-page only when the section names one.
        if t["link"]:
            more = ('<a class="btn btn-s btn-sm" href="%s.html">Alle %s ansehen</a>'
                    % (t["link"][0], esc(t["link"][1])))
        elif t["slug"] != "therapien":
            more = '<a class="btn btn-s btn-sm" href="%s.html#%s">Ganzen Text lesen</a>' % (t["slug"], t["id"])
        else:
            more = ""
        rows.append('<div class="row" id="%s" data-cat="%s" data-hay="%s">'
                    '<button type="button" aria-expanded="false">'
                    '<img src="%s" alt="%s" loading="lazy">'
                    '<span class="row-t"><strong>%s</strong><span>%s</span></span>%s</button>'
                    '<div class="row-p"><p>%s</p><div class="tags">%s</div><div class="row-acts">'
                    '<a class="btn btn-p btn-sm" href="kontakt.html" data-book="%s">Diesen Termin anfragen</a>'
                    '%s</div></div></div>'
                    % (t["id"], t["slug"], esc(hay), img(t["img"]), esc(alt_for(t["img"])),
                       esc(t["heading"]), esc(t["page"]), CHEV, esc(t["blurb"]), tags,
                       esc(t["heading"]), more))
    return ('<div class="cat-tools"><div class="search">%s'
            '<input id="cat-q" type="search" placeholder="Beschwerde oder Behandlung suchen" '
            'aria-label="Behandlungen durchsuchen"></div><div class="tabs">%s</div></div>'
            '<p class="cat-count" id="cat-count">%d von %d Behandlungen</p>'
            '<div class="cat">%s<p class="cat-empty" id="cat-empty" hidden>'
            'Dazu ist nichts hinterlegt. Rufen Sie mich an und wir sprechen darüber.</p></div>'
            ) % (SEARCH, tabs, len(ts), len(ts), "".join(rows))


def page_index():
    p, h = C.PRACTICE, C.HOME
    facts = "".join('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(a), b) for a, b in
                    [("Praxis", "Uerdingerstr. 573<br>47800 Krefeld"),
                     ("Erstgespräch", "60 Minuten<br>nach Vereinbarung"),
                     ("Zulassung", "Heilpraktikerin<br>seit 16.06.2016")])
    quick = "".join('<a href="therapien.html#%s">%s</a>' % (t["id"], esc(t["heading"]))
                    for t in C.all_treatments()[:6])
    hero = ('<section class="hero"><div class="wrap hero-g"><div>'
            '<p class="lbl brand">Naturheilpraxis Krefeld · Rafia Willemsen</p>'
            '<h1>Termin anfragen. Ursache finden. Beschwerden behandeln.</h1>'
            '<p class="sub">%s</p><dl class="facts">%s</dl>'
            '<div class="quick"><p class="lbl">Häufig gesucht</p><div class="quicklinks">%s</div></div>'
            '<div class="who"><img src="%s" alt="%s"><div><strong>%s</strong>'
            '<span>%s · %s · %s</span></div></div>'
            '</div>%s</div></section>') % (esc(h["paras"][2]), facts, quick,
                                           img("_v6a4005-2.jpg"), esc(alt_for("_v6a4005-2.jpg")),
                                           esc(C.ABOUT["name"]), esc(p["role"]),
                                           esc(p["licensed"]), esc(p["association"]),
                                           booking_panel())

    steps = "".join('<div class="step"><b>%d</b><h3>%s</h3><p>%s</p></div>' % (i, esc(a), esc(b))
                    for i, (a, b) in enumerate(STEPS, 1))
    stepsec = ('<section class="sec sec-alt"><div class="wrap">'
               '<div class="sec-hd"><p class="lbl brand">Ablauf</p><h2>Ihr erster Termin</h2>'
               '<p>%s</p></div><div class="steps">%s</div></div></section>') % (esc(h["paras"][0]), steps)

    cat = ('<section class="sec"><div class="wrap">'
           '<div class="sec-hd"><p class="lbl brand">Behandlungen</p><h2>Alle %d Behandlungen</h2>'
           '<p>Suchen Sie nach einer Beschwerde oder nach dem Namen der Behandlung. '
           'Eine Zeile öffnet die Beschreibung.</p></div>%s</div></section>'
           ) % (len(C.all_treatments()), catalogue())

    info = ('<section class="sec sec-alt"><div class="wrap"><div class="info">'
            '<div class="icard">%s<h3>Anfahrt</h3><address>%s<br>%s %s<br><br>'
            '<a href="https://www.openstreetmap.org/search?query=Uerdingerstr.%%20573%%2047800%%20Krefeld">'
            'Karte öffnen</a></address></div>'
            '<div class="icard">%s<h3>Termine</h3><p>Nach Vereinbarung. Der erste Termin dauert eine Stunde. '
            'Telefonisch erreichen Sie mich unter <a href="tel:%s">%s</a>.</p>'
            '<a class="btn btn-p btn-sm" href="kontakt.html">Termin anfragen</a></div>'
            '<div class="icard">%s<h3>Qualifikation</h3><p>%s, %s. %s. %s.</p>'
            '<a class="btn btn-s btn-sm" href="impressum.html">Impressum</a></div>'
            '</div></div></section>'
            ) % (PIN, esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                 CLOCK, p["phone_link"], esc(p["phone"]), DOC,
                 esc(C.ABOUT["name"]), esc(p["role"]), esc(p["licensed"]), esc(p["association"]))

    faq = ('<section class="sec"><div class="wrap">'
           '<div class="sec-hd"><p class="lbl brand">Fragen</p><h2>Bevor Sie kommen</h2></div>'
           '<div class="faq">%s</div></div></section>'
           ) % "".join('<details><summary>%s</summary><p>%s</p></details>' % (esc(a), esc(b)) for a, b in FAQ)

    return shell("index", "Naturheilpraxis Sanare Naturalis · Krefeld · Termin anfragen",
                 "Naturheilpraxis in Krefeld. Termin anfragen, 20 Behandlungen von manueller "
                 "Therapie bis Wellness-Massage.", hero + stepsec + cat + info + faq)


def aside_box():
    p = C.PRACTICE
    return ('<aside class="aside">%s'
            '<div class="icard">%s<h3>Praxis</h3><address>%s<br>%s %s<br><br>'
            '<a href="tel:%s">%s</a></address></div></aside>'
            ) % (booking_panel(), PIN, esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                 p["phone_link"], esc(p["phone"]))


def page_treatments(slug):
    page = C.PAGES[slug]
    crumb = '<a href="index.html">Home</a> / '
    if page.get("parent"):
        crumb += '<a href="%s.html">%s</a> / ' % page["parent"]
    crumb += esc(page["title"])

    if slug == "therapien":
        body = ('<div class="phead"><div class="wrap"><p class="crumb">%s</p>'
                '<h1>%s</h1><p>%s</p></div></div>'
                '<section class="sec"><div class="wrap">%s</div></section>'
                ) % (crumb, esc(page["title"]), esc(C.QUOTE["gloss"]), catalogue())
        return shell(slug, "Therapien · Sanare Naturalis Krefeld", page["lede"], body)

    arts = []
    for s in page["sections"]:
        paras = "".join("<p>%s</p>" % esc(t) for t in s["paras"])
        fig = ('<figure><img src="%s" alt="%s" loading="lazy"></figure>'
               % (img(s["img"]), esc(alt_for(s["img"])))) if s.get("img") else ""
        tags = ('<div class="tags">%s</div>' % "".join("<span>%s</span>" % esc(x) for x in s["tags"])) \
            if s.get("tags") else ""
        arts.append('<section id="%s">%s<span class="lbl">%s</span><h2>%s</h2>%s%s'
                    '<p style="margin-top:18px"><a class="btn btn-p btn-sm" href="kontakt.html" '
                    'data-book="%s">Diesen Termin anfragen</a></p></section>'
                    % (s["id"], fig, esc(page["title"]), esc(s["heading"]), paras, tags, esc(s["heading"])))

    body = ('<div class="phead"><div class="wrap"><p class="crumb">%s</p><h1>%s</h1><p>%s</p></div></div>'
            '<div class="wrap"><div class="doc"><div class="art">%s</div>%s</div></div>'
            ) % (crumb, esc(page["title"]), esc(page["lede"]), "".join(arts), aside_box())
    return shell(slug, "%s · Sanare Naturalis Krefeld" % page["title"], page["lede"], body)


def page_aktuelles():
    arts = []
    for n in C.AKTUELLES:
        paras = "".join("<p>%s</p>" % esc(t) for t in n["paras"])
        dates = ('<div class="dates">%s</div>' % "".join(
            "<div><b>%s</b><span>%s</span></div>" % (esc(a), esc(b)) for a, b in n["dates"])) if n["dates"] else ""
        arts.append('<article><img src="%s" alt="%s" loading="lazy"><div class="news-b">'
                    '<span class="lbl brand">Angebot</span><h2>%s</h2>'
                    '<span class="tarif">%s</span>%s%s'
                    '<a class="btn btn-p btn-sm" href="kontakt.html" data-book="%s">Termin anfragen</a>'
                    '</div></article>' % (img(n["img"]), esc(alt_for(n["img"])), esc(n["heading"]),
                                          esc(n["price"]), paras, dates, esc(n["heading"])))
    body = ('<div class="phead"><div class="wrap"><p class="crumb"><a href="index.html">Home</a> / Aktuelles</p>'
            '<h1>Aktuelles</h1><p>Angebote und Kurse aus der Praxis.</p></div></div>'
            '<div class="wrap"><div class="news">%s</div></div>') % "".join(arts)
    return shell("aktuelles", "Aktuelles · Sanare Naturalis Krefeld",
                 "Angebote und Kurse der Naturheilpraxis Sanare Naturalis in Krefeld.", body)


def page_kontakt():
    p = C.PRACTICE
    info = ('<div class="art">'
            '<section>%s<h2>Anfahrt</h2><address style="font-style:normal;color:var(--muted)">%s<br>%s %s</address>'
            '<p style="margin-top:14px"><a href="https://www.openstreetmap.org/search?query='
            'Uerdingerstr.%%20573%%2047800%%20Krefeld">Karte öffnen</a></p></section>'
            '<section>%s<h2>Telefon</h2><p>Mobil <a href="tel:%s">%s</a>. '
            'Wenn ich in einer Behandlung bin rufe ich zurück.</p></section>'
            '<section>%s<h2>Termine</h2><p>Nach Vereinbarung. Der erste Termin dauert eine Stunde. '
            'Bringen Sie vorhandene ärztliche Befunde mit.</p></section>'
            '</div>') % (PIN, esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                         PHONE, p["phone_link"], esc(p["phone"]), CLOCK)
    body = ('<div class="phead"><div class="wrap"><p class="crumb"><a href="index.html">Home</a> / Kontakt</p>'
            '<h1>%s</h1><p>Schreiben Sie mir oder rufen Sie an. Ich melde mich zurück.</p></div></div>'
            '<div class="wrap"><div class="doc">%s<aside class="aside">%s</aside></div></div>'
            ) % (esc(C.CONTACT["heading"]), info, booking_panel())
    return shell("kontakt", "Kontakt · Sanare Naturalis Krefeld",
                 "Naturheilpraxis Sanare Naturalis, Uerdingerstr. 573, 47800 Krefeld.", body)


def page_impressum():
    m = C.IMPRESSUM
    lines = "<br>".join(esc(x) for x in m["lines"])
    facts = "".join("<dt>%s</dt><dd>%s</dd>" % (esc(a), esc(b)) for a, b in m["facts"])
    blocks = "".join("<h2>%s</h2><p>%s</p>" % (esc(a), esc(b)) for a, b in m["blocks"])
    body = ('<div class="wrap"><div class="legal"><h1>Impressum</h1><p>%s</p>'
            '<address>%s</address><dl>%s</dl>%s</div></div>') % (esc(m["responsible"]), lines, facts, blocks)
    return shell("impressum", "Impressum · Sanare Naturalis Krefeld",
                 "Impressum der Naturheilpraxis Sanare Naturalis.", body)


def build(out):
    os.makedirs(out, exist_ok=True)
    write(out, "style.css", CSS.strip() + "\n")
    write(out, "main.js", JS.strip() + "\n")
    write(out, "index.html", page_index())
    for slug in C.PAGES:
        write(out, slug + ".html", page_treatments(slug))
    write(out, "aktuelles.html", page_aktuelles())
    write(out, "kontakt.html", page_kontakt())
    write(out, "impressum.html", page_impressum())
    return 4 + len(C.PAGES)
