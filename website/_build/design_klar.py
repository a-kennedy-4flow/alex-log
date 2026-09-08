# -*- coding: utf-8 -*-
"""Design 1 "Klar". Trust first. The practitioner and the route to a first
appointment are the whole page. A symptom finder replaces the menu tree."""
import os
from util import esc, write, img, alt_for
import content as C

NAME = "klar"
TITLE = "Klar"
TAGLINE = "Vertrauen zuerst. Beschwerdefinder statt Menübaum."

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">')

CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{
  --paper:#FBFAF6; --surface:#FFFFFF; --ink:#14262A; --muted:#5C6E71;
  --line:#E7E2D7; --line-s:#F0ECE3;
  --brand:#2E6B74; --brand-d:#1C484F; --brand-l:#E9F1F0;
  --sand:#BE855F; --sand-t:#8E6347; --sand-l:#F7EEE6; --leaf:#6E9E44;
  --r:14px; --r-l:22px;
  --sh:0 1px 2px rgba(20,40,42,.05),0 14px 34px -14px rgba(20,40,42,.16);
  --sh-h:0 2px 4px rgba(20,40,42,.06),0 22px 46px -16px rgba(20,40,42,.24);
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --wrap:1180px;
}
html{scroll-behavior:smooth;scroll-padding-top:96px}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.7 var(--sans);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
a{color:var(--brand-d);text-decoration-thickness:1px;text-underline-offset:3px}
h1,h2,h3,h4{font-family:var(--serif);font-weight:600;line-height:1.15;letter-spacing:-.015em;margin:0}
.wrap{width:min(var(--wrap),calc(100% - 48px));margin-inline:auto}
.eyebrow{font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--brand);margin:0 0 18px}
.eyebrow.sand{color:var(--sand-t)}
.lede{font-size:19px;color:var(--muted);margin:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ---- buttons ---- */
.btn{display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:13px 24px;
  font:600 15px/1 var(--sans);text-decoration:none;border:1px solid transparent;cursor:pointer;
  transition:background .18s,color .18s,border-color .18s,transform .18s,box-shadow .18s}
.btn-p{background:var(--brand);color:#fff;box-shadow:0 10px 24px -12px rgba(46,107,116,.9)}
.btn-p:hover{background:var(--brand-d);transform:translateY(-1px)}
.btn-g{background:transparent;color:var(--brand-d);border-color:var(--line)}
.btn-g:hover{border-color:var(--brand);background:var(--surface)}
.btn-w{background:#fff;color:var(--brand-d)}
.btn-w:hover{transform:translateY(-1px);box-shadow:var(--sh-h)}
.btn-o{background:transparent;color:#fff;border-color:rgba(255,255,255,.42)}
.btn-o:hover{border-color:#fff;background:rgba(255,255,255,.1)}

/* ---- header ---- */
.hd{position:sticky;top:0;z-index:60;background:rgba(251,250,246,.88);
  backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line-s)}
.hd-in{display:flex;align-items:center;gap:26px;min-height:78px}
.logo{display:flex;align-items:center;text-decoration:none;flex:0 0 auto}
.logo img{height:44px;width:auto}
.nav{display:flex;align-items:center;gap:4px;margin-left:auto}
.nav a{position:relative;padding:9px 13px;border-radius:9px;font:500 15px/1 var(--sans);
  color:var(--ink);text-decoration:none;white-space:nowrap;transition:background .15s,color .15s}
.nav a:hover{background:var(--brand-l);color:var(--brand-d)}
.nav a[aria-current="page"]{color:var(--brand-d)}
.nav a[aria-current="page"]::after{content:"";position:absolute;left:13px;right:13px;bottom:2px;height:2px;
  border-radius:2px;background:var(--brand)}
.drop{position:relative}
.drop>button{display:flex;align-items:center;gap:6px;background:none;border:0;cursor:pointer;
  padding:9px 13px;border-radius:9px;font:500 15px/1 var(--sans);color:var(--ink)}
.drop>button:hover{background:var(--brand-l);color:var(--brand-d)}
.drop>button svg{transition:transform .2s}
.drop[data-open]>button svg{transform:rotate(180deg)}
.drop-m{position:absolute;top:calc(100% + 8px);left:0;min-width:238px;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:7px;
  opacity:0;visibility:hidden;transform:translateY(-6px);transition:.18s}
.drop[data-open] .drop-m{opacity:1;visibility:visible;transform:none}
.drop-m a{display:block;padding:10px 12px;border-radius:9px;font-size:15px}
.hd-cta{display:flex;align-items:center;gap:12px;flex:0 0 auto}
.hd-tel{display:inline-flex;align-items:center;gap:8px;font:600 15px/1 var(--sans);
  color:var(--brand-d);text-decoration:none;white-space:nowrap}
.hd-tel:hover{color:var(--brand)}
.burger{display:none;background:none;border:1px solid var(--line);border-radius:10px;
  width:44px;height:44px;cursor:pointer;align-items:center;justify-content:center}
.mob{display:none;border-top:1px solid var(--line-s);padding:14px 0 22px}
.mob a{display:block;padding:12px 4px;border-bottom:1px solid var(--line-s);
  font:500 16px/1 var(--sans);color:var(--ink);text-decoration:none}
.mob a.sub{padding-left:20px;color:var(--muted);font-size:15px}
.mob .btn{margin-top:16px;width:100%;justify-content:center}
.hd[data-mob] .mob{display:block}

/* ---- hero ---- */
.hero{padding:74px 0 52px}
.hero-g{display:grid;grid-template-columns:1.04fr .96fr;gap:70px;align-items:center}
.hero h1{font-size:clamp(38px,4.6vw,58px);margin:0 0 22px}
.hero h1 em{font-style:normal;color:var(--brand);display:block}
.hero p{font-size:19px;color:var(--muted);margin:0 0 30px;max-width:52ch}
.hero-btns{display:flex;flex-wrap:wrap;gap:12px}
.trust{display:flex;flex-wrap:wrap;gap:10px 26px;margin-top:38px;padding-top:26px;border-top:1px solid var(--line)}
.trust div{display:flex;align-items:center;gap:9px;font:500 14px/1.4 var(--sans);color:var(--muted)}
.trust svg{flex:0 0 auto;color:var(--leaf)}
.hero-fig{position:relative}
.hero-fig::before{content:"";position:absolute;inset:26px -26px -26px 26px;border-radius:var(--r-l);
  background:var(--sand-l)}
.hero-fig img{position:relative;border-radius:var(--r-l);box-shadow:var(--sh);aspect-ratio:1/1;object-fit:cover;width:100%}
.badge{position:absolute;left:-24px;bottom:34px;z-index:2;background:var(--surface);
  border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);padding:15px 19px;max-width:236px}
.badge strong{display:block;font:600 15px/1.3 var(--sans);margin-bottom:3px}
.badge span{font-size:13px;color:var(--muted);line-height:1.45;display:block}

/* ---- generic section ---- */
.sec{padding:84px 0}
.sec-alt{background:var(--surface);border-block:1px solid var(--line-s)}
.sec-hd{max-width:640px;margin-bottom:44px}
.sec-hd h2{font-size:clamp(28px,3.2vw,40px);margin:0 0 14px}
.sec-hd.mid{margin-inline:auto;text-align:center}

/* ---- finder ---- */
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:34px}
.chip{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:9px 17px;
  font:500 14px/1 var(--sans);color:var(--ink);cursor:pointer;transition:.15s}
.chip:hover{border-color:var(--brand);color:var(--brand-d)}
.chip[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}
.finder-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  margin-bottom:22px;font-size:14px;color:var(--muted)}
.reset{background:none;border:0;color:var(--brand-d);font:500 14px/1 var(--sans);cursor:pointer;
  text-decoration:underline;text-underline-offset:3px;padding:0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-l);overflow:hidden;
  display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s,border-color .2s}
.card:hover{transform:translateY(-3px);box-shadow:var(--sh-h);border-color:var(--line)}
.card[hidden]{display:none}
.card img{aspect-ratio:16/10;object-fit:cover;width:100%}
.card-b{padding:22px 24px 26px;display:flex;flex-direction:column;flex:1}
.card-k{font:600 11px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sand-t);margin-bottom:11px}
.card h3{font-size:21px;margin:0 0 10px}
.card p{margin:0 0 20px;font-size:15px;color:var(--muted);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card-l{margin-top:auto;font:600 14px/1 var(--sans);color:var(--brand-d);text-decoration:none;
  display:inline-flex;align-items:center;gap:7px}
.card-l:hover{gap:11px}
.card-l svg{transition:transform .18s}
.empty{grid-column:1/-1;text-align:center;padding:56px 20px;color:var(--muted);
  border:1px dashed var(--line);border-radius:var(--r-l)}

/* ---- quote ---- */
.quote{background:var(--brand-d);color:#fff;padding:86px 0}
.quote-in{max-width:820px;margin-inline:auto;text-align:center}
.quote blockquote{margin:0 0 24px;font-family:var(--serif);font-size:clamp(28px,3.6vw,42px);
  line-height:1.28;font-style:italic}
.quote cite{display:block;font:600 13px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;
  color:rgba(255,255,255,.62);font-style:normal;margin-bottom:30px}
.quote p{color:rgba(255,255,255,.8);font-size:17px;margin:0;text-align:left}

/* ---- about ---- */
.about-g{display:grid;grid-template-columns:.85fr 1.15fr;gap:64px;align-items:start}
.about-fig img{border-radius:var(--r-l);box-shadow:var(--sh)}
.about-meta{margin-top:22px;padding:18px 20px;background:var(--brand-l);border-radius:var(--r)}
.about-meta strong{display:block;font:600 16px/1.3 var(--sans)}
.about-meta span{font-size:14px;color:var(--muted)}
.cv{list-style:none;margin:30px 0 0;padding:0;border-left:2px solid var(--line)}
.cv li{position:relative;padding:0 0 22px 26px}
.cv li::before{content:"";position:absolute;left:-6px;top:9px;width:10px;height:10px;border-radius:50%;
  background:var(--paper);border:2px solid var(--brand)}
.cv b{display:block;font:600 13px/1 var(--sans);letter-spacing:.1em;color:var(--sand-t);margin-bottom:5px}
.cv span{font-size:16px;color:var(--muted)}

/* ---- cta band ---- */
.cta{background:var(--brand);color:#fff;padding:72px 0}
.cta-g{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
.cta h2{font-size:clamp(28px,3.2vw,38px);margin:0 0 14px}
.cta p{color:rgba(255,255,255,.84);margin:0 0 28px;font-size:17px}
.cta-btns{display:flex;flex-wrap:wrap;gap:12px}
.cta-card{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);
  border-radius:var(--r-l);padding:30px 32px}
.cta-card dl{margin:0;display:grid;gap:18px}
.cta-card dt{font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;
  color:rgba(255,255,255,.6);margin-bottom:5px}
.cta-card dd{margin:0;font-size:17px}
.cta-card a{color:#fff}

/* ---- interior ---- */
.phero{padding:44px 0 0}
.crumb{display:flex;gap:9px;align-items:center;font-size:14px;color:var(--muted);margin-bottom:22px}
.crumb a{color:var(--muted)}
.phero h1{font-size:clamp(34px,4.2vw,50px);margin:0 0 16px;max-width:18ch}
.phero .lede{max-width:56ch}
.phero-img{margin-top:44px;border-radius:var(--r-l);overflow:hidden;box-shadow:var(--sh)}
.phero-img img{aspect-ratio:1058/396;object-fit:cover;width:100%}
.doc{display:grid;grid-template-columns:222px 1fr;gap:64px;padding:70px 0 90px;align-items:start}
.toc{position:sticky;top:104px}
.toc p{font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sand-t);margin:0 0 16px}
.toc ol{list-style:none;margin:0;padding:0;border-left:1px solid var(--line);display:grid}
.toc a{display:block;padding:9px 0 9px 18px;margin-left:-1px;border-left:2px solid transparent;
  font-size:15px;color:var(--muted);text-decoration:none;transition:.15s}
.toc a:hover{color:var(--brand-d)}
.toc a.on{border-left-color:var(--brand);color:var(--brand-d);font-weight:600}
.art>section{padding-bottom:56px;margin-bottom:56px;border-bottom:1px solid var(--line)}
.art>section:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
.art h2{font-size:clamp(26px,3vw,34px);margin:0 0 20px}
.art p{margin:0 0 18px;max-width:68ch}
.art figure{margin:0 0 28px;border-radius:var(--r-l);overflow:hidden;box-shadow:var(--sh)}
.art figure img{width:100%;aspect-ratio:16/9;object-fit:cover}
.tagrow{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0}
.tag{background:var(--brand-l);color:var(--brand-d);border-radius:999px;padding:6px 13px;
  font:500 13px/1 var(--sans)}
.nextlink{display:inline-flex;align-items:center;gap:9px;margin-top:8px;font:600 15px/1 var(--sans);
  color:var(--brand-d);text-decoration:none}
.nextlink:hover{gap:13px}

/* ---- news ---- */
.news{display:grid;gap:32px}
.news article{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-l);
  overflow:hidden;display:grid;grid-template-columns:.8fr 1.2fr}
.news img{height:100%;object-fit:cover;width:100%;min-height:260px}
.news-b{padding:36px 40px}
.news h2{font-size:28px;margin:0 0 8px}
.price{display:inline-block;background:var(--sand-l);color:var(--sand-t);border-radius:999px;
  padding:6px 14px;font:600 13px/1 var(--sans);margin-bottom:18px}
.dates{margin:20px 0 0;padding:20px 0 0;border-top:1px solid var(--line-s);display:grid;gap:14px}
.dates div b{display:block;font:600 13px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;
  color:var(--sand-t);margin-bottom:5px}
.dates div span{font-size:15px;color:var(--muted)}

/* ---- contact ---- */
.kontakt-g{display:grid;grid-template-columns:.9fr 1.1fr;gap:56px;align-items:start}
.form{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-l);padding:34px 36px;box-shadow:var(--sh)}
.field{margin-bottom:20px}
.field label{display:block;font:600 14px/1 var(--sans);margin-bottom:8px}
.field .req{color:var(--sand-t)}
.field input,.field textarea,.field select{width:100%;border:1px solid var(--line);border-radius:11px;
  padding:13px 15px;font:400 16px/1.5 var(--sans);color:var(--ink);background:var(--paper);
  transition:border-color .15s,box-shadow .15s}
.field textarea{min-height:150px;resize:vertical}
.field input:focus,.field textarea:focus{outline:0;border-color:var(--brand);
  box-shadow:0 0 0 3px var(--brand-l)}
.form .btn{width:100%;justify-content:center}
.note{font-size:13px;color:var(--muted);margin:16px 0 0;text-align:center}
.info{display:grid;gap:26px}
.info-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-l);padding:28px 30px}
.info-card h3{font-size:20px;margin:0 0 14px}
.info-card address{font-style:normal;font-size:17px;line-height:1.8;color:var(--muted)}
.info-card address a{color:var(--brand-d);font-weight:600}
.map{border-radius:var(--r-l);overflow:hidden;border:1px solid var(--line);height:280px;
  background:var(--brand-l);display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.map p{margin:0;color:var(--brand-d);font-size:15px}

/* ---- legal ---- */
.legal{max-width:76ch;padding:60px 0 90px}
.legal h1{font-size:clamp(32px,4vw,44px);margin:0 0 28px}
.legal h2{font-size:21px;margin:40px 0 12px}
.legal p{color:var(--muted);margin:0 0 16px}
.legal address{font-style:normal;line-height:1.9;color:var(--muted);margin-bottom:28px}
.legal dl{display:grid;grid-template-columns:auto 1fr;gap:10px 22px;margin:0 0 12px}
.legal dt{font-weight:600}
.legal dd{margin:0;color:var(--muted)}

/* ---- footer ---- */
.ft{background:var(--surface);border-top:1px solid var(--line);padding:60px 0 30px;margin-top:0}
.ft-g{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:44px;padding-bottom:44px}
.ft img{height:42px;width:auto;margin-bottom:18px}
.ft p{font-size:15px;color:var(--muted);margin:0;max-width:34ch}
.ft h4{font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sand-t);margin:0 0 16px}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:11px}
.ft a{font-size:15px;color:var(--muted);text-decoration:none}
.ft a:hover{color:var(--brand-d)}
.ft-b{border-top:1px solid var(--line-s);padding-top:24px;display:flex;justify-content:space-between;
  gap:16px;flex-wrap:wrap;font-size:14px;color:var(--muted)}

@media(max-width:1040px){
  .nav,.hd-tel{display:none}
  .burger{display:flex}
  .hero-g,.about-g,.cta-g,.kontakt-g{grid-template-columns:1fr;gap:44px}
  .doc{grid-template-columns:1fr;gap:0}
  .toc{position:static;margin-bottom:44px}
  .toc ol{display:flex;flex-wrap:wrap;border-left:0;gap:6px}
  .toc a{border:1px solid var(--line);border-radius:999px;padding:8px 15px;margin:0}
  .toc a.on{border-color:var(--brand)}
  .grid{grid-template-columns:repeat(2,1fr)}
  .ft-g{grid-template-columns:1fr 1fr;gap:34px}
  .news article{grid-template-columns:1fr}
  .news img{min-height:220px}
  .badge{left:0}
}
@media(max-width:680px){
  .hd-cta>.btn-p{display:none}
  body{font-size:16px}
  .wrap{width:calc(100% - 34px)}
  .sec{padding:60px 0}
  .grid{grid-template-columns:1fr}
  .ft-g{grid-template-columns:1fr}
  .hero{padding:48px 0 60px}
  .form,.news-b,.info-card,.cta-card{padding:26px 22px}
}
@media(prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
  html{scroll-behavior:auto}
}
"""

JS = """
(function(){
  var hd=document.querySelector('.hd');
  var burger=document.querySelector('.burger');
  if(burger){burger.addEventListener('click',function(){
    var open=hd.hasAttribute('data-mob');
    if(open){hd.removeAttribute('data-mob')}else{hd.setAttribute('data-mob','')}
    burger.setAttribute('aria-expanded',String(!open));
  });}
  document.querySelectorAll('.drop').forEach(function(d){
    var b=d.querySelector('button');
    b.addEventListener('click',function(e){
      e.stopPropagation();
      var open=d.hasAttribute('data-open');
      document.querySelectorAll('.drop').forEach(function(o){o.removeAttribute('data-open')});
      if(!open){d.setAttribute('data-open','')}
      b.setAttribute('aria-expanded',String(!open));
    });
  });
  document.addEventListener('click',function(){
    document.querySelectorAll('.drop').forEach(function(o){
      o.removeAttribute('data-open');
      o.querySelector('button').setAttribute('aria-expanded','false');
    });
  });

  /* Beschwerdefinder. A card shows when it carries every chosen tag. */
  var chips=document.querySelectorAll('.chip');
  var cards=document.querySelectorAll('.card[data-tags]');
  var count=document.getElementById('finder-count');
  var empty=document.getElementById('finder-empty');
  var reset=document.getElementById('finder-reset');
  function apply(){
    var on=[];
    chips.forEach(function(c){if(c.getAttribute('aria-pressed')==='true'){on.push(c.dataset.tag)}});
    var shown=0;
    cards.forEach(function(card){
      var hay=card.dataset.tags;
      var ok=on.length===0||on.some(function(t){return hay.indexOf(t)>-1});
      card.hidden=!ok; if(ok){shown++}
    });
    if(count){count.textContent=shown===cards.length?(cards.length+' Behandlungen'):(shown+' von '+cards.length+' Behandlungen')}
    if(empty){empty.hidden=shown>0}
    if(reset){reset.hidden=on.length===0}
  }
  chips.forEach(function(c){c.addEventListener('click',function(){
    c.setAttribute('aria-pressed',c.getAttribute('aria-pressed')==='true'?'false':'true');apply();
  })});
  if(reset){reset.addEventListener('click',function(){
    chips.forEach(function(c){c.setAttribute('aria-pressed','false')});apply();
  })}
  apply();

  /* Table of contents follows the reader. */
  var links=document.querySelectorAll('.toc a');
  if(links.length){
    var secs=[].map.call(links,function(a){return document.querySelector(a.getAttribute('href'))}).filter(Boolean);
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(!e.isIntersecting)return;
        links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)});
      });
    },{rootMargin:'-90px 0px -70% 0px'});
    secs.forEach(function(s){io.observe(s)});
  }
})();
"""

# ---------------------------------------------------------------- fragments
ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
CHEV = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
PHONE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>'
CHECK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
BURGER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'

CHIPS = ["Rücken", "Schulter", "Knie", "Hüfte", "Gelenke", "Wirbelsäule", "Verspannung",
         "Migräne", "Kopfschmerz", "Arthrose", "Faszien", "Stress", "Entspannung",
         "Immunsystem", "Entgiftung", "Erschöpfung", "Haut", "Falten", "Füße"]


def nav_html(cur):
    out = []
    for slug, label, kids in C.NAV:
        href = slug + ".html"
        if kids:
            sub = "".join('<a href="%s.html">%s</a>' % (k, esc(v)) for k, v in kids)
            sub = '<a href="%s">%s — Übersicht</a>%s' % (href, esc(label), sub)
            out.append('<div class="drop"><button type="button" aria-expanded="false">%s %s</button>'
                       '<div class="drop-m">%s</div></div>' % (esc(label), CHEV, sub))
        else:
            a = ' aria-current="page"' if slug == cur else ""
            out.append('<a href="%s"%s>%s</a>' % (href, a, esc(label)))
    return '<nav class="nav" aria-label="Hauptmenü">%s</nav>' % "".join(out)


def mob_html():
    out = []
    for slug, label, kids in C.NAV:
        out.append('<a href="%s.html">%s</a>' % (slug, esc(label)))
        for k, v in kids:
            out.append('<a class="sub" href="%s.html">%s</a>' % (k, esc(v)))
    out.append('<a class="btn btn-p" href="kontakt.html">Termin vereinbaren</a>')
    return '<div class="mob">%s</div>' % "".join(out)


def header(cur):
    p = C.PRACTICE
    return ('<header class="hd">'
            '<div class="wrap hd-in">'
            '<a class="logo" href="index.html"><img src="%s" alt="%s"></a>'
            '%s'
            '<div class="hd-cta">'
            '<a class="hd-tel" href="tel:%s">%s %s</a>'
            '<a class="btn btn-p" href="kontakt.html">Termin vereinbaren</a>'
            '<button class="burger" type="button" aria-expanded="false" aria-label="Menü öffnen">%s</button>'
            '</div></div>'
            '<div class="wrap">%s</div>'
            '</header>') % (img("sanare-naturalis.jpg"), esc(alt_for("sanare-naturalis.jpg")),
                            nav_html(cur), p["phone_link"], PHONE, esc(p["phone"]), BURGER, mob_html())


def footer():
    p = C.PRACTICE
    ther = "".join('<li><a href="%s.html">%s</a></li>' % (k, esc(v)) for k, v in C.NAV[1][2])
    return ('<footer class="ft"><div class="wrap">'
            '<div class="ft-g">'
            '<div><img src="%s" alt="%s"><p>Naturheilpraxis in Krefeld. Ich behandle nicht die '
            'Krankheit sondern den Menschen.</p></div>'
            '<div><h4>Therapien</h4><ul>%s<li><a href="wellness-massagen.html">Wellness-Massagen</a></li>'
            '<li><a href="aesthetische-medizin.html">Ästhetische Medizin</a></li></ul></div>'
            '<div><h4>Praxis</h4><ul><li><a href="index.html#ueber-mich">Über mich</a></li>'
            '<li><a href="aktuelles.html">Aktuelles</a></li>'
            '<li><a href="kontakt.html">Kontakt</a></li>'
            '<li><a href="impressum.html">Impressum</a></li></ul></div>'
            '<div><h4>Kontakt</h4><ul><li>%s</li><li>%s %s</li>'
            '<li><a href="tel:%s">%s</a></li></ul></div>'
            '</div>'
            '<div class="ft-b"><span>© 2026 %s · %s</span>'
            '<span>%s · %s</span></div>'
            '</div></footer>') % (img("sanare-naturalis.jpg"), esc(alt_for("sanare-naturalis.jpg")),
                                  ther, esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                                  p["phone_link"], esc(p["phone"]), esc(p["name"]),
                                  esc(p["practitioner"]), esc(p["role"]), esc(p["licensed"]))


def shell(cur, title, desc, body):
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s">'
            '<link rel="icon" href="%s">'
            '%s<link rel="stylesheet" href="style.css"></head><body>'
            '<a class="sr" href="#main">Zum Inhalt springen</a>'
            '%s<main id="main">%s</main>%s'
            '<script src="main.js"></script></body></html>'
            ) % (esc(title), esc(desc), img("sanare-naturalis.jpg"), FONTS,
                 header(cur), body, footer())


def card(t):
    hay = " ".join(t["tags"] + [t["heading"], t["page"]]).lower()
    tags = "".join('<span class="tag">%s</span>' % esc(x) for x in t["tags"][:3])
    return ('<article class="card" data-tags="%s">'
            '<img src="%s" alt="%s" loading="lazy">'
            '<div class="card-b"><p class="card-k">%s</p><h3>%s</h3><p>%s</p>'
            '<a class="card-l" href="%s.html#%s">Mehr erfahren %s</a></div></article>'
            ) % (esc(hay), img(t["img"]), esc(alt_for(t["img"])), esc(t["page"]),
                 esc(t["heading"]), esc(t["blurb"]), t["slug"], t["id"], ARROW)

# ---------------------------------------------------------------- pages
def page_index():
    p, h, a, q = C.PRACTICE, C.HOME, C.ABOUT, C.QUOTE
    trust = "".join('<div>%s<span>%s</span></div>' % (CHECK, esc(x)) for x in
                    ["Heilpraktikerin mit Zulassung seit 2016", "Mitglied im BDH",
                     "Praxis in Krefeld-Bockum", "Termine auch am Abend"])
    hero = ('<section class="hero"><div class="wrap hero-g">'
            '<div><p class="eyebrow">Naturheilpraxis in Krefeld</p>'
            '<h1>Ich behandle nicht die Krankheit. <em>Ich behandle Sie.</em></h1>'
            '<p>%s</p>'
            '<div class="hero-btns"><a class="btn btn-p" href="kontakt.html">Termin vereinbaren %s</a>'
            '<a class="btn btn-g" href="#finder">Beschwerden finden</a></div>'
            '<div class="trust">%s</div></div>'
            '<div class="hero-fig"><img src="%s" alt="%s">'
            '<div class="badge"><strong>%s</strong><span>%s · %s</span></div></div>'
            '</div></section>') % (esc(h["paras"][2]), ARROW, trust,
                                   img("_v6a4005-2.jpg"), esc(alt_for("_v6a4005-2.jpg")),
                                   esc(a["name"]), esc(p["role"]), esc(p["licensed"]))

    chips = "".join('<button class="chip" type="button" aria-pressed="false" data-tag="%s">%s</button>'
                    % (esc(c.lower()), esc(c)) for c in CHIPS)
    ts = C.all_treatments()
    cards = "".join(card(t) for t in ts)
    finder = ('<section class="sec" id="finder"><div class="wrap">'
              '<div class="sec-hd"><p class="eyebrow">Beschwerdefinder</p>'
              '<h2>Was führt Sie zu mir?</h2>'
              '<p class="lede">Wählen Sie ein Thema. Die passenden Behandlungen erscheinen sofort. '
              'Welche davon für Sie richtig ist klären wir im ersten Termin.</p></div>'
              '<div class="chips">%s</div>'
              '<div class="finder-bar"><span id="finder-count">%d Behandlungen</span>'
              '<button class="reset" id="finder-reset" type="button" hidden>Auswahl zurücksetzen</button></div>'
              '<div class="grid">%s'
              '<p class="empty" id="finder-empty" hidden>Zu dieser Auswahl ist nichts hinterlegt. '
              'Rufen Sie mich an und wir sprechen darüber.</p></div>'
              '</div></section>') % (chips, len(ts), cards)

    quote = ('<section class="quote"><div class="wrap quote-in">'
             '<blockquote>„%s“</blockquote><cite>%s</cite><p>%s</p>'
             '</div></section>') % (esc(q["latin"]), esc(q["source"]), esc(q["gloss"]))

    cv = "".join('<li>%s<span>%s</span></li>' %
                 ('<b>%s</b>' % esc(y) if y else "", esc(t)) for y, t in a["cv"])
    about = ('<section class="sec sec-alt" id="ueber-mich"><div class="wrap about-g">'
             '<div class="about-fig"><img src="%s" alt="%s">'
             '<div class="about-meta"><strong>%s</strong><span>%s · %s</span></div></div>'
             '<div><p class="eyebrow">%s</p><h2 style="font-size:clamp(28px,3.2vw,40px);margin-bottom:18px">%s</h2>'
             '<p class="lede">%s</p><p style="margin-top:20px;color:var(--muted)">%s</p>'
             '<ol class="cv">%s</ol></div>'
             '</div></section>') % (img("_v6a4005-2.jpg"), esc(alt_for("_v6a4005-2.jpg")),
                                    esc(a["name"]), esc(a["line"]), esc(p["association"]),
                                    esc(a["heading"]), esc(h["heading"]),
                                    esc(h["paras"][0]), esc(h["paras"][1]), cv)

    cta = ('<section class="cta"><div class="wrap cta-g">'
           '<div><h2>Der erste Termin dauert eine Stunde.</h2>'
           '<p>Wir gehen Ihre Beschwerden durch. Danach schlage ich Ihnen eine Therapieform vor. '
           'Rufen Sie an oder schreiben Sie mir.</p>'
           '<div class="cta-btns"><a class="btn btn-w" href="tel:%s">%s %s anrufen</a>'
           '<a class="btn btn-o" href="kontakt.html">Nachricht schreiben</a></div></div>'
           '<div class="cta-card"><dl>'
           '<div><dt>Praxis</dt><dd>%s<br>%s %s</dd></div>'
           '<div><dt>Telefon</dt><dd><a href="tel:%s">%s</a></dd></div>'
           '<div><dt>Termine</dt><dd>Nach Vereinbarung</dd></div>'
           '</dl></div></div></section>') % (p["phone_link"], PHONE, esc(p["phone"]),
                                             esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                                             p["phone_link"], esc(p["phone"]))

    return shell("index", "Naturheilpraxis Sanare Naturalis · Rafia Willemsen · Krefeld",
                 "Naturheilpraxis in Krefeld. Manuelle Therapien, Infusionstherapien, "
                 "Faszien-Therapie, Wellness-Massagen und Ästhetische Medizin.",
                 hero + finder + quote + about + cta)


def page_treatments(slug):
    page = C.PAGES[slug]
    crumb = '<a href="index.html">Home</a> <span>/</span> '
    if page.get("parent"):
        crumb += '<a href="%s.html">%s</a> <span>/</span> ' % page["parent"]
    crumb += '<span>%s</span>' % esc(page["title"])

    toc = "".join('<li><a href="#%s">%s</a></li>' % (s["id"], esc(s["heading"])) for s in page["sections"])
    arts = []
    for s in page["sections"]:
        paras = "".join("<p>%s</p>" % esc(t) for t in s["paras"])
        fig = ""
        if s.get("img"):
            fig = ('<figure><img src="%s" alt="%s" loading="lazy"></figure>'
                   % (img(s["img"]), esc(alt_for(s["img"]))))
        tags = ""
        if s.get("tags"):
            tags = '<div class="tagrow">%s</div>' % "".join(
                '<span class="tag">%s</span>' % esc(x) for x in s["tags"])
        link = ""
        if s.get("link"):
            link = ('<p><a class="nextlink" href="%s.html">Alle %s ansehen %s</a></p>'
                    % (s["link"][0], esc(s["link"][1]), ARROW))
        arts.append('<section id="%s">%s<h2>%s</h2>%s%s%s</section>'
                    % (s["id"], fig, esc(s["heading"]), paras, link, tags))

    hero_img = ""
    if page.get("hero"):
        hero_img = ('<div class="wrap"><div class="phero-img"><img src="%s" alt="%s"></div></div>'
                    % (img(page["hero"]), esc(alt_for(page["hero"]))))

    body = ('<section class="phero"><div class="wrap">'
            '<nav class="crumb" aria-label="Pfad">%s</nav>'
            '<h1>%s</h1><p class="lede">%s</p></div>%s</section>'
            '<div class="wrap"><div class="doc">'
            '<nav class="toc" aria-label="Auf dieser Seite"><p>Auf dieser Seite</p><ol>%s</ol></nav>'
            '<div class="art">%s</div></div></div>'
            ) % (crumb, esc(page["title"]), esc(page["lede"]), hero_img, toc, "".join(arts))

    cta = ('<section class="cta"><div class="wrap cta-g">'
           '<div><h2>Passt eine dieser Behandlungen zu Ihnen?</h2>'
           '<p>Das klären wir am besten im Gespräch. Der erste Termin dauert eine Stunde.</p>'
           '<div class="cta-btns"><a class="btn btn-w" href="kontakt.html">Termin anfragen %s</a>'
           '<a class="btn btn-o" href="tel:%s">%s anrufen</a></div></div>'
           '<div class="cta-card"><dl>'
           '<div><dt>Praxis</dt><dd>%s<br>%s %s</dd></div>'
           '<div><dt>Telefon</dt><dd><a href="tel:%s">%s</a></dd></div>'
           '</dl></div></div></section>') % (ARROW, C.PRACTICE["phone_link"], esc(C.PRACTICE["phone"]),
                                             esc(C.PRACTICE["street"]), esc(C.PRACTICE["postcode"]),
                                             esc(C.PRACTICE["city"]), C.PRACTICE["phone_link"],
                                             esc(C.PRACTICE["phone"]))
    return shell(slug, "%s · Sanare Naturalis Krefeld" % page["title"], page["lede"], body + cta)


def page_aktuelles():
    arts = []
    for n in C.AKTUELLES:
        paras = "".join("<p>%s</p>" % esc(t) for t in n["paras"])
        dates = ""
        if n["dates"]:
            dates = '<div class="dates">%s</div>' % "".join(
                '<div><b>%s</b><span>%s</span></div>' % (esc(a), esc(b)) for a, b in n["dates"])
        arts.append('<article><img src="%s" alt="%s" loading="lazy">'
                    '<div class="news-b"><h2>%s</h2><span class="price">%s</span>%s%s'
                    '<p style="margin-top:24px"><a class="nextlink" href="kontakt.html">Termin anfragen %s</a></p>'
                    '</div></article>'
                    % (img(n["img"]), esc(alt_for(n["img"])), esc(n["heading"]),
                       esc(n["price"]), paras, dates, ARROW))
    body = ('<section class="phero"><div class="wrap">'
            '<nav class="crumb" aria-label="Pfad"><a href="index.html">Home</a> <span>/</span> <span>Aktuelles</span></nav>'
            '<h1>Aktuelles</h1><p class="lede">Angebote und Kurse aus der Praxis.</p></div></section>'
            '<section class="sec"><div class="wrap"><div class="news">%s</div></div></section>') % "".join(arts)
    return shell("aktuelles", "Aktuelles · Sanare Naturalis Krefeld",
                 "Angebote und Kurse der Naturheilpraxis Sanare Naturalis in Krefeld.", body)


def page_kontakt():
    p = C.PRACTICE
    fields = []
    for fid, label, kind, req in C.CONTACT["form"]:
        star = ' <span class="req">*</span>' if req else ""
        r = " required" if req else ""
        if kind == "textarea":
            inp = '<textarea id="%s" name="%s"%s></textarea>' % (fid, fid, r)
        else:
            inp = '<input id="%s" name="%s" type="%s"%s>' % (fid, fid, kind, r)
        fields.append('<div class="field"><label for="%s">%s%s</label>%s</div>' % (fid, esc(label), star, inp))
    form = ('<form class="form" method="post" action="#">'
            '<div class="field"><label for="anliegen">Anliegen</label>'
            '<select id="anliegen" name="anliegen">%s</select></div>'
            '%s<button class="btn btn-p" type="submit">%s %s</button>'
            '<p class="note">Pflichtfelder sind mit * gekennzeichnet.</p></form>'
            ) % ("".join('<option>%s</option>' % esc(t["heading"]) for t in C.all_treatments()),
                 "".join(fields), esc(C.CONTACT["submit"]), ARROW)

    info = ('<div class="info">'
            '<div class="info-card"><h3>Praxis</h3><address>%s<br>%s %s<br><br>'
            'Mobil: <a href="tel:%s">%s</a><br>%s</address></div>'
            '<div class="map"><p>Uerdingerstr. 573 · 47800 Krefeld<br>'
            '<a href="https://www.openstreetmap.org/search?query=Uerdingerstr.%%20573%%2047800%%20Krefeld">'
            'Auf der Karte öffnen</a></p></div>'
            '<div class="info-card"><h3>Termine</h3><address>Nach Vereinbarung.<br>'
            'Der erste Termin dauert eine Stunde.</address></div>'
            '</div>') % (esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                         p["phone_link"], esc(p["phone"]), esc(p["web"]))

    body = ('<section class="phero"><div class="wrap">'
            '<nav class="crumb" aria-label="Pfad"><a href="index.html">Home</a> <span>/</span> <span>Kontakt</span></nav>'
            '<h1>%s</h1><p class="lede">Schreiben Sie mir oder rufen Sie an. Ich melde mich zurück.</p>'
            '</div></section>'
            '<section class="sec"><div class="wrap kontakt-g">%s%s</div></section>'
            ) % (esc(C.CONTACT["heading"]), info, form)
    return shell("kontakt", "Kontakt · Sanare Naturalis Krefeld",
                 "Naturheilpraxis Sanare Naturalis, Uerdingerstr. 573, 47800 Krefeld.", body)


def page_impressum():
    m = C.IMPRESSUM
    lines = "<br>".join(esc(x) for x in m["lines"])
    facts = "".join("<dt>%s</dt><dd>%s</dd>" % (esc(a), esc(b)) for a, b in m["facts"])
    blocks = "".join("<h2>%s</h2><p>%s</p>" % (esc(a), esc(b)) for a, b in m["blocks"])
    body = ('<div class="wrap"><div class="legal"><h1>Impressum</h1>'
            '<p>%s</p><address>%s</address><dl>%s</dl>%s</div></div>'
            ) % (esc(m["responsible"]), lines, facts, blocks)
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
