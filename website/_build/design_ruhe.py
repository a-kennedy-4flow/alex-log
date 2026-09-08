# -*- coding: utf-8 -*-
"""Design 2 "Ruhe". The practice sold as an experience. Photography runs
full width. Type is large and quiet. The reader scrolls rather than clicks."""
import os
from util import esc, write, img, alt_for
import content as C

NAME = "ruhe"
TITLE = "Ruhe"
TAGLINE = "Ganzseitige Fotografie. Grosse Typografie. Scrollen statt klicken."

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">')

CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{
  --night:#16211D; --night2:#1F2E28; --night3:#2A3B34;
  --cream:#F6F2E9; --paper:#FCFAF5;
  --ink:#1B2823; --muted:#606F68; --line:#E2DBCB;
  --sage:#8CA692; --sand:#C9AE8A; --gold:#A97F4F; --gold-t:#88663F;
  --disp:"Cormorant Garamond",Georgia,serif;
  --body:"Jost",system-ui,-apple-system,"Segoe UI",sans-serif;
  --wrap:1240px; --narrow:660px;
  --ease:cubic-bezier(.22,.61,.36,1);
}
html{scroll-behavior:smooth;scroll-padding-top:80px}
body{margin:0;background:var(--paper);color:var(--ink);
  font:400 17px/1.85 var(--body);-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--disp);font-weight:300;line-height:1.1;margin:0;letter-spacing:.005em}
.wrap{width:min(var(--wrap),calc(100% - 56px));margin-inline:auto}
.narrow{width:min(var(--narrow),calc(100% - 44px));margin-inline:auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.kicker{font:400 11px/1 var(--body);letter-spacing:.32em;text-transform:uppercase;color:var(--gold-t);margin:0 0 26px}
.kicker.pale{color:var(--sand)}
.rule{width:52px;height:1px;background:var(--gold);margin:34px 0}
.rule.mid{margin-inline:auto}

/* ---- link and button ---- */
.lnk{display:inline-flex;align-items:center;gap:12px;font:400 12px/1 var(--body);
  letter-spacing:.24em;text-transform:uppercase;text-decoration:none;color:var(--ink);
  padding-bottom:9px;border-bottom:1px solid var(--line);transition:.3s var(--ease)}
.lnk:hover{border-color:var(--gold);color:var(--gold)}
.lnk.pale{color:var(--cream);border-color:rgba(246,242,233,.34)}
.lnk.pale:hover{color:#fff;border-color:var(--sand)}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:16px 34px;
  font:400 12px/1 var(--body);letter-spacing:.24em;text-transform:uppercase;text-decoration:none;
  border:1px solid var(--night);color:var(--night);background:none;cursor:pointer;transition:.3s var(--ease)}
.btn:hover{background:var(--night);color:var(--cream)}
.btn.solid{background:var(--night);color:var(--cream)}
.btn.solid:hover{background:var(--night3)}
.btn.pale{border-color:rgba(246,242,233,.5);color:var(--cream)}
.btn.pale:hover{background:var(--cream);color:var(--night)}

/* ---- header ---- */
.hd{position:fixed;inset:0 0 auto;z-index:70;transition:background .4s var(--ease),box-shadow .4s}
.hd-in{display:flex;align-items:center;gap:30px;min-height:88px}
.logo{text-decoration:none;flex:0 0 auto}
.mark{display:block;font-family:var(--disp);font-size:26px;line-height:1;color:var(--cream);letter-spacing:.01em}
.mark i{font-style:italic;color:var(--sand)}
.mark-sub{display:block;font:400 9px/1 var(--body);letter-spacing:.3em;text-transform:uppercase;
  color:var(--sand);margin-top:7px}
.hd.light .mark{color:var(--ink)}
.nav{display:flex;gap:30px;margin-left:auto;align-items:center}
.nav a{font:400 12px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;
  color:var(--cream);text-decoration:none;padding:6px 0;border-bottom:1px solid transparent;transition:.3s}
.nav a:hover,.nav a[aria-current="page"]{border-color:var(--sand)}
.hd-tel{font:400 12px/1 var(--body);letter-spacing:.16em;color:var(--cream);text-decoration:none;white-space:nowrap}
.burger{display:none;width:46px;height:46px;background:none;border:1px solid rgba(246,242,233,.4);
  color:var(--cream);cursor:pointer;align-items:center;justify-content:center}
.hd.solid{background:rgba(22,33,29,.94);backdrop-filter:blur(14px)}
.hd.light{background:var(--paper);box-shadow:0 1px 0 var(--line)}
.hd.light .nav a,.hd.light .hd-tel{color:var(--ink)}
.hd.light .burger{border-color:var(--line);color:var(--ink)}
.mob{display:none;background:var(--night);padding:16px 0 30px}
.mob a{display:block;padding:14px 0;border-bottom:1px solid rgba(246,242,233,.13);
  font:400 12px/1 var(--body);letter-spacing:.2em;text-transform:uppercase;color:var(--cream);text-decoration:none}
.mob a.sub{padding-left:20px;color:var(--sage);letter-spacing:.12em}
.hd[data-mob] .mob{display:block}

/* ---- hero ---- */
.hero{position:relative;min-height:min(100svh,860px);display:grid;place-items:center;isolation:isolate;
  color:var(--cream);text-align:center;padding:140px 0 90px;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:-2}
.hero-bg img{width:100%;height:100%;object-fit:cover;object-position:50% 64%;transform:scale(1.06);
  animation:drift 26s var(--ease) infinite alternate}
@keyframes drift{to{transform:scale(1.14) translate3d(-1.4%,-1.4%,0)}}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(180deg,rgba(12,20,17,.72) 0%,rgba(12,20,17,.42) 42%,rgba(12,20,17,.82) 100%)}
.hero h1{font-size:clamp(46px,8.4vw,116px);font-weight:300;line-height:.98;margin:0 0 30px}
.hero h1 i{font-style:italic;color:var(--sand)}
.hero p{max-width:52ch;margin:0 auto 42px;color:rgba(246,242,233,.86);font-size:18px}
.scroll-cue{position:absolute;bottom:38px;left:50%;transform:translateX(-50%);
  font:400 10px/1 var(--body);letter-spacing:.3em;text-transform:uppercase;color:rgba(246,242,233,.6)}
.scroll-cue span{display:block;width:1px;height:52px;background:rgba(246,242,233,.4);margin:14px auto 0;
  transform-origin:top;animation:cue 2.6s var(--ease) infinite}
@keyframes cue{0%{transform:scaleY(0)}45%{transform:scaleY(1)}100%{transform:scaleY(0);transform-origin:bottom}}

/* ---- reveal ---- */
.rv{opacity:0;transform:translateY(26px);transition:opacity .9s var(--ease),transform .9s var(--ease)}
.rv.in{opacity:1;transform:none}

/* ---- welcome ---- */
.welcome{padding:120px 0;text-align:center;background:var(--cream)}
.welcome h2{font-size:clamp(30px,4.4vw,54px);margin:0 0 34px;font-style:italic}
.welcome p{color:var(--muted);margin:0 0 22px;font-size:18px}
.welcome p:last-of-type{margin-bottom:0}

/* ---- numbered bands ---- */
.band{padding:118px 0}
.band-g{display:grid;grid-template-columns:1fr 1fr;gap:78px;align-items:center}
.band:nth-of-type(even) .band-fig{order:2}
.band-fig{position:relative}
.band-fig img{width:100%;aspect-ratio:4/5;object-fit:cover}
.band-fig figcaption{position:absolute;left:0;bottom:-1px;background:var(--paper);padding:16px 26px 0 0;
  font-family:var(--disp);font-size:clamp(64px,8vw,116px);line-height:.8;color:var(--sand)}
.band-tx h2{font-size:clamp(30px,4vw,50px);margin:0 0 26px}
.band-tx p{color:var(--muted);margin:0 0 20px}
.band-tx .lnk{margin-top:16px}
.band-alt{background:var(--cream)}
.band-alt .band-fig figcaption{background:var(--cream)}

/* ---- quote ---- */
.quote{position:relative;isolation:isolate;color:var(--cream);padding:150px 0;text-align:center}
.quote-bg{position:absolute;inset:0;z-index:-2}
.quote-bg img{width:100%;height:100%;object-fit:cover}
.quote::after{content:"";position:absolute;inset:0;z-index:-1;background:rgba(14,22,19,.76)}
.quote blockquote{margin:0;font-family:var(--disp);font-style:italic;font-weight:300;
  font-size:clamp(34px,6.4vw,84px);line-height:1.06}
.quote cite{display:block;font:400 11px/1 var(--body);letter-spacing:.3em;text-transform:uppercase;
  color:var(--sand);font-style:normal;margin:34px 0 44px}
.quote p{max-width:62ch;margin:0 auto;color:rgba(246,242,233,.8);font-size:17px}

/* ---- about ---- */
.about{padding:130px 0;background:var(--cream)}
.about-g{display:grid;grid-template-columns:.82fr 1.18fr;gap:88px;align-items:start}
.about-fig{position:relative;padding:0 0 22px 22px}
.about-fig::before{content:"";position:absolute;inset:22px 22px 0 0;border:1px solid var(--sand)}
.about-fig img{position:relative;width:100%;aspect-ratio:3/4;object-fit:cover}
.about h2{font-size:clamp(30px,4vw,52px);margin:0 0 24px}
.about p{color:var(--muted);margin:0 0 20px}
.cv{list-style:none;margin:44px 0 0;padding:0;display:grid;gap:0}
.cv li{display:grid;grid-template-columns:76px 1fr;gap:22px;padding:16px 0;border-top:1px solid var(--line)}
.cv li:last-child{border-bottom:1px solid var(--line)}
.cv b{font:500 12px/1.6 var(--body);letter-spacing:.14em;color:var(--gold-t)}
.cv span{font-size:15px;color:var(--muted);line-height:1.6}

/* ---- gallery rail ---- */
.rail-sec{padding:120px 0 130px;overflow:hidden}
.rail-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:52px;flex-wrap:wrap}
.rail-hd h2{font-size:clamp(30px,4vw,50px)}
.rail{display:flex;gap:26px;overflow-x:auto;padding-bottom:22px;scroll-snap-type:x mandatory;
  scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.rail::-webkit-scrollbar{height:4px}
.rail::-webkit-scrollbar-thumb{background:var(--line)}
.rail article{flex:0 0 320px;scroll-snap-align:start}
.rail img{width:100%;aspect-ratio:3/4;object-fit:cover;margin-bottom:22px}
.rail h3{font-size:25px;margin:0 0 12px}
.rail p{font-size:15px;color:var(--muted);margin:0 0 18px;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* ---- contact band ---- */
.cband{background:var(--night);color:var(--cream);padding:130px 0}
.cband-g{display:grid;grid-template-columns:1.1fr .9fr;gap:74px;align-items:center}
.cband h2{font-size:clamp(32px,4.6vw,60px);margin:0 0 26px}
.cband p{color:rgba(246,242,233,.76);margin:0 0 38px;max-width:44ch}
.cband dl{margin:0;display:grid;gap:26px}
.cband dt{font:400 11px/1 var(--body);letter-spacing:.28em;text-transform:uppercase;
  color:var(--sand);margin-bottom:10px}
.cband dd{margin:0;font-family:var(--disp);font-size:25px;line-height:1.4}
.cband dd a{text-decoration:none}
.cband dd a:hover{color:var(--sand)}

/* ---- interior ---- */
.phero{position:relative;isolation:isolate;color:var(--cream);padding:210px 0 100px;text-align:center}
.phero-bg{position:absolute;inset:0;z-index:-2}
.phero-bg img{width:100%;height:100%;object-fit:cover;object-position:50% 55%}
.phero::after{content:"";position:absolute;inset:0;z-index:-1;background:rgba(14,22,19,.66)}
.phero h1{font-size:clamp(38px,6.4vw,86px);margin:0 0 22px}
.phero p{max-width:50ch;margin:0 auto;color:rgba(246,242,233,.82)}
.crumb{font:400 11px/1 var(--body);letter-spacing:.26em;text-transform:uppercase;
  color:var(--sand);margin-bottom:26px}
.crumb a{text-decoration:none}
.crumb a:hover{color:var(--cream)}
.art{padding:110px 0 40px}
.art section{margin-bottom:110px}
.art section:last-child{margin-bottom:0}
.art h2{font-size:clamp(30px,4.4vw,54px);margin:0 0 30px;text-align:center}
.art .rule{margin-inline:auto}
.art p{color:var(--muted);margin:0 0 24px}
.art section>.narrow>p:first-of-type::first-letter{font-family:var(--disp);font-size:4.1em;
  float:left;line-height:.82;padding:6px 14px 0 0;color:var(--gold)}
.figfull{margin:56px 0 60px}
.figfull img{width:100%;aspect-ratio:21/9;object-fit:cover}
.tagline{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:44px}
.tagline span{border:1px solid var(--line);padding:7px 16px;font:400 11px/1 var(--body);
  letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.progress{position:fixed;top:0;left:0;height:2px;background:var(--gold);z-index:80;width:0}

/* ---- news ---- */
.news{padding:110px 0}
.news article{display:grid;grid-template-columns:1fr 1fr;gap:66px;align-items:center;margin-bottom:110px}
.news article:nth-child(even) .news-fig{order:2}
.news article:last-child{margin-bottom:0}
.news img{width:100%;aspect-ratio:4/3;object-fit:cover}
.news h2{font-size:clamp(28px,3.6vw,46px);margin:0 0 18px;text-align:left}
.news p{color:var(--muted);margin:0 0 20px}
.tarif{font-family:var(--disp);font-size:30px;color:var(--gold-t);margin:0 0 24px}
.dates{margin:30px 0 26px;border-top:1px solid var(--line)}
.dates div{padding:16px 0;border-bottom:1px solid var(--line)}
.dates b{display:block;font:500 11px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;
  color:var(--gold-t);margin-bottom:9px}
.dates span{font-size:15px;color:var(--muted)}

/* ---- contact page ---- */
.kg{display:grid;grid-template-columns:1fr 1fr;gap:78px;align-items:start;padding:110px 0}
.field{margin-bottom:26px}
.field label{display:block;font:400 11px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;
  color:var(--muted);margin-bottom:11px}
.field input,.field textarea,.field select{width:100%;border:0;border-bottom:1px solid var(--line);
  background:none;padding:12px 0;font:400 17px/1.6 var(--body);color:var(--ink)}
.field textarea{min-height:130px;resize:vertical}
.field input:focus,.field textarea:focus,.field select:focus{outline:0;border-color:var(--gold)}
.kinfo dl{margin:0 0 44px;display:grid;gap:30px}
.kinfo dt{font:400 11px/1 var(--body);letter-spacing:.26em;text-transform:uppercase;color:var(--gold-t);margin-bottom:10px}
.kinfo dd{margin:0;font-family:var(--disp);font-size:24px;line-height:1.45}
.kinfo dd a{text-decoration:none}
.kmap{border:1px solid var(--line);aspect-ratio:16/10;display:grid;place-items:center;text-align:center;padding:26px}
.kmap p{margin:0;font-size:15px;color:var(--muted)}

/* ---- legal ---- */
.legal{padding:110px 0}
.legal h1{font-size:clamp(34px,5vw,62px);margin:0 0 40px}
.legal h2{font-size:26px;margin:52px 0 16px}
.legal p,.legal address{color:var(--muted);font-style:normal;margin:0 0 18px;line-height:1.85}
.legal dl{display:grid;grid-template-columns:auto 1fr;gap:12px 26px;margin:0 0 18px}
.legal dt{color:var(--ink)}
.legal dd{margin:0;color:var(--muted)}

/* ---- footer ---- */
.ft{background:var(--night);color:rgba(246,242,233,.66);padding:90px 0 36px}
.ft-g{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:52px;padding-bottom:64px}
.ft .mark{font-size:32px;margin-bottom:8px}
.ft .mark-sub{margin-bottom:24px}
.ft h4{font:400 11px/1 var(--body);letter-spacing:.26em;text-transform:uppercase;color:var(--sand);margin:0 0 20px}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:13px}
.ft a{text-decoration:none;font-size:15px}
.ft a:hover{color:var(--cream)}
.ft p{font-size:15px;max-width:32ch;margin:0}
.ft-b{border-top:1px solid rgba(246,242,233,.13);padding-top:28px;display:flex;
  justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:13px;letter-spacing:.06em}

@media(max-width:1040px){
  .nav,.hd-tel{display:none}
  .burger{display:flex}
  .band-g,.about-g,.cband-g,.kg,.news article{grid-template-columns:1fr;gap:44px}
  .band:nth-of-type(even) .band-fig,.news article:nth-child(even) .news-fig{order:0}
  .band-fig img{aspect-ratio:16/11}
  .ft-g{grid-template-columns:1fr 1fr;gap:38px}
}
@media(max-width:680px){
  body{font-size:16px}
  .wrap{width:calc(100% - 34px)}
  .band,.welcome,.about,.rail-sec,.cband,.news,.kg{padding:72px 0}
  .quote{padding:96px 0}
  .phero{padding:160px 0 76px}
  .ft-g{grid-template-columns:1fr}
  .rail article{flex:0 0 250px}
  .cv li{grid-template-columns:1fr;gap:6px}
}
@media(prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important}
  .rv{opacity:1;transform:none}
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

  /* The header sits on the photograph until the reader leaves it. */
  var overlay=document.body.classList.contains('has-overlay-hero');
  function onScroll(){
    var y=window.scrollY;
    if(overlay){hd.classList.toggle('solid',y>60)}
    else{hd.classList.toggle('light',true)}
    var bar=document.querySelector('.progress');
    if(bar){
      var h=document.documentElement.scrollHeight-window.innerHeight;
      bar.style.width=(h>0?(y/h*100):0)+'%';
    }
  }
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}});
  },{rootMargin:'0px 0px -12% 0px'});
  document.querySelectorAll('.rv').forEach(function(el){io.observe(el)});
})();
"""

MARK = ('<a class="logo" href="index.html">'
        '<span class="mark">Sanare <i>Naturalis</i></span>'
        '<span class="mark-sub">Naturheilpraxis · Krefeld</span></a>')

BURGER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/></svg>'
ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

# The five doors into the practice. Each is one band on the home page.
BANDS = [
    ("manuelle-therapien", "Manuelle Therapien", "_v6a3192neuausschnitt.jpg",
     ["Dorntherapie, Breuss-Massage, Skribben und die Wirbelsäulen-Meridian-Balance.",
      "Bedingt durch den Arbeitsalltag, leiden inzwischen immer mehr Menschen unter „Rücken“, aber auch Schulter-, Knie- und Hüftprobleme nehmen zu. Klassische manuelle Therapien sind eine Möglichkeit, ohne Einsatz von Medikamenten eine Entlastung zu unterstützen."]),
    ("infusionstherapien", "Infusionstherapien", "_v6a2940neu-cropped.jpg",
     ["Vitamin C in Hochdosis und Vitamin B12 direkt über die Blutbahn.",
      "Die Umgehung des Magen-Darm-Traktes verhindert den Verlust von wertvollen Bestandteilen. So steht der Nährstoff dem Körper direkt über das Blut zur Verfügung."]),
    ("faszien-therapie", "Faszien-Therapie", "_v6a3184neuausschnitt.jpg",
     ["Die ISBT Bowen-Therapie als sanfte manuelle Heilmethode.",
      "Faszien sind bindegewebige Umhüllungen von Muskeln und sorgen für geschmeidige Beweglichkeit. Kleinste Bowen-Moves regen die betroffenen Körperbereiche an, ihren ursprünglichen Spannungszustand wieder herzustellen."]),
    ("wellness-massagen", "Wellness-Massagen", "_v6a3055ausschnitt.jpg",
     ["Sieben Massagen von der Aromaöl-Massage bis zur Fußreflexzonen-Massage.",
      "Kräuterstempel werden in meiner Praxis nicht industriell eingekauft. Nach Beratung werden Ihre Kräuterstempel individuell auf Sie und Ihre Bedürfnisse hin angefertigt."]),
    ("aesthetische-medizin", "Ästhetische Medizin", "_v6a2931neu-cropped.jpg",
     ["Faltenreduzierende Unterspritzungen mit körpereigenem Hyaluron.",
      "Ist nicht auch die eigene Wahrnehmung und das Mit-sich-im-Reinen-sein ein wichtiger Baustein unseres subjektiven Wohlgefühls?"]),
]


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


def header(cur, light):
    p = C.PRACTICE
    cls = "hd light" if light else "hd"
    return ('<header class="%s">'
            '<div class="wrap hd-in">'
            '%s%s'
            '<a class="hd-tel" href="tel:%s">%s</a>'
            '<button class="burger" type="button" aria-expanded="false" aria-label="Menü öffnen">%s</button>'
            '</div>%s</header>') % (cls, MARK, nav_html(cur), p["phone_link"], esc(p["phone"]),
                                    BURGER, mob_html())


def footer():
    p = C.PRACTICE
    ther = "".join('<li><a href="%s.html">%s</a></li>' % (k, esc(v)) for k, v in C.NAV[1][2])
    return ('<footer class="ft"><div class="wrap"><div class="ft-g">'
            '<div>%s<p>Naturheilpraxis in Krefeld. Die Selbstheilungskräfte '
            'des Körpers aktivieren.</p></div>'
            '<div><h4>Therapien</h4><ul>%s<li><a href="wellness-massagen.html">Wellness-Massagen</a></li>'
            '<li><a href="aesthetische-medizin.html">Ästhetische Medizin</a></li></ul></div>'
            '<div><h4>Praxis</h4><ul><li><a href="index.html#ueber-mich">Über mich</a></li>'
            '<li><a href="aktuelles.html">Aktuelles</a></li><li><a href="kontakt.html">Kontakt</a></li>'
            '<li><a href="impressum.html">Impressum</a></li></ul></div>'
            '<div><h4>Kontakt</h4><ul><li>%s</li><li>%s %s</li>'
            '<li><a href="tel:%s">%s</a></li></ul></div>'
            '</div><div class="ft-b"><span>© 2026 %s</span><span>%s · %s</span></div>'
            '</div></footer>') % (MARK, ther,
                                  esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                                  p["phone_link"], esc(p["phone"]), esc(p["name"]),
                                  esc(p["practitioner"]), esc(p["role"]))


def shell(cur, title, desc, body, overlay=True, progress=False):
    cls = "has-overlay-hero" if overlay else ""
    bar = '<div class="progress"></div>' if progress else ""
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>%s</title><meta name="description" content="%s">'
            '<link rel="icon" href="%s">%s<link rel="stylesheet" href="style.css"></head>'
            '<body class="%s"><a class="sr" href="#main">Zum Inhalt springen</a>%s%s'
            '<main id="main">%s</main>%s<script src="main.js"></script></body></html>'
            ) % (esc(title), esc(desc), img("sanare-naturalis.jpg"), FONTS, cls, bar,
                 header(cur, not overlay), body, footer())

# ---------------------------------------------------------------- pages
def page_index():
    p, h, a, q = C.PRACTICE, C.HOME, C.ABOUT, C.QUOTE

    hero = ('<section class="hero">'
            '<div class="hero-bg"><img src="%s" alt="%s"></div>'
            '<div class="wrap"><p class="kicker pale">Naturheilpraxis · Krefeld</p>'
            '<h1>Zur Ruhe kommen.<br><i>Gesund bleiben.</i></h1>'
            '<p>%s</p>'
            '<a class="btn pale" href="kontakt.html">Termin vereinbaren</a></div>'
            '<div class="scroll-cue">Scrollen<span></span></div>'
            '</section>') % (img("_v6a2960neu-cropped.jpg"), esc(alt_for("_v6a2960neu-cropped.jpg")),
                             esc(h["paras"][2]))

    welcome = ('<section class="welcome"><div class="narrow rv">'
               '<p class="kicker">Willkommen</p><h2>%s</h2><div class="rule mid"></div>'
               '<p>%s</p><p>%s</p></div></section>'
               ) % (esc("Ich behandle nicht die Symptome, sondern Menschen."),
                    esc(h["paras"][0]), esc(h["paras"][1]))

    bands = []
    for i, (slug, label, image, paras) in enumerate(BANDS, 1):
        alt = " band-alt" if i % 2 == 0 else ""
        body = "".join("<p>%s</p>" % esc(t) for t in paras)
        bands.append('<section class="band%s"><div class="wrap band-g">'
                     '<figure class="band-fig rv"><img src="%s" alt="%s" loading="lazy">'
                     '<figcaption>%02d</figcaption></figure>'
                     '<div class="band-tx rv"><p class="kicker">Therapie</p><h2>%s</h2>%s'
                     '<a class="lnk" href="%s.html">Mehr erfahren %s</a></div>'
                     '</div></section>'
                     % (alt, img(image), esc(alt_for(image)), i, esc(label), body, slug, ARROW))

    quote = ('<section class="quote"><div class="quote-bg"><img src="%s" alt="" loading="lazy"></div>'
             '<div class="wrap rv"><blockquote>%s</blockquote><cite>%s</cite><p>%s</p></div>'
             '</section>') % (img("_v6a2940neu-cropped.jpg"), esc(q["latin"]), esc(q["source"]), esc(q["gloss"]))

    cv = "".join('<li><b>%s</b><span>%s</span></li>' % (esc(y) if y else "—", esc(t)) for y, t in a["cv"])
    about = ('<section class="about" id="ueber-mich"><div class="wrap about-g">'
             '<figure class="about-fig rv"><img src="%s" alt="%s" loading="lazy"></figure>'
             '<div class="rv"><p class="kicker">%s</p><h2>%s</h2>'
             '<p>%s</p><p>%s</p><ul class="cv">%s</ul></div>'
             '</div></section>') % (img("_v6a4005-2.jpg"), esc(alt_for("_v6a4005-2.jpg")),
                                    esc(a["heading"]), esc(a["name"]), esc(a["line"]),
                                    esc("4-jährige Ausbildung zur Heilpraktikerin in Villa Salutis, Krefeld. "
                                        "Qualitätszirkel mit Kolleginnen zum stetigen Austausch und Weiterbildung."), cv)

    mass = C.PAGES["wellness-massagen"]["sections"]
    rail = "".join('<article><img src="%s" alt="%s" loading="lazy"><h3>%s</h3><p>%s</p>'
                   '<a class="lnk" href="wellness-massagen.html#%s">Ansehen %s</a></article>'
                   % (img(s["img"]), esc(alt_for(s["img"])), esc(s["heading"]),
                      esc(s["paras"][0]), s["id"], ARROW) for s in mass)
    rails = ('<section class="rail-sec"><div class="wrap">'
             '<div class="rail-hd rv"><div><p class="kicker">Wellness-Massagen</p>'
             '<h2>Sieben Wege zur Auszeit</h2></div>'
             '<a class="lnk" href="wellness-massagen.html">Alle ansehen %s</a></div>'
             '<div class="rail rv">%s</div></div></section>') % (ARROW, rail)

    cband = ('<section class="cband"><div class="wrap cband-g">'
             '<div class="rv"><p class="kicker pale">Termin</p>'
             '<h2>Der erste Termin dauert eine Stunde.</h2>'
             '<p>Wir gehen Ihre Beschwerden durch. Danach schlage ich Ihnen eine Therapieform vor.</p>'
             '<a class="btn pale" href="kontakt.html">Nachricht schreiben</a></div>'
             '<dl class="rv"><div><dt>Praxis</dt><dd>%s<br>%s %s</dd></div>'
             '<div><dt>Telefon</dt><dd><a href="tel:%s">%s</a></dd></div>'
             '<div><dt>Termine</dt><dd>Nach Vereinbarung</dd></div></dl>'
             '</div></section>') % (esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                                    p["phone_link"], esc(p["phone"]))

    return shell("index", "Sanare Naturalis · Naturheilpraxis Krefeld · Rafia Willemsen",
                 "Naturheilpraxis in Krefeld. Manuelle Therapien, Infusionstherapien, "
                 "Faszien-Therapie, Wellness-Massagen und Ästhetische Medizin.",
                 hero + welcome + "".join(bands) + quote + about + rails + cband)


def page_treatments(slug):
    page = C.PAGES[slug]
    crumb = '<a href="index.html">Home</a> · '
    if page.get("parent"):
        crumb += '<a href="%s.html">%s</a> · ' % page["parent"]
    crumb += esc(page["title"])

    arts = []
    for i, s in enumerate(page["sections"]):
        paras = "".join("<p>%s</p>" % esc(t) for t in s["paras"])
        tags = ""
        if s.get("tags"):
            tags = '<div class="tagline">%s</div>' % "".join(
                "<span>%s</span>" % esc(x) for x in s["tags"])
        fig = ""
        if s.get("img") and i % 2 == 0:
            fig = ('<figure class="figfull rv"><img src="%s" alt="%s" loading="lazy"></figure>'
                   % (img(s["img"]), esc(alt_for(s["img"]))))
        link = ""
        if s.get("link"):
            link = ('<p style="text-align:center;margin-top:36px">'
                    '<a class="lnk" href="%s.html">Alle %s ansehen %s</a></p>'
                    % (s["link"][0], esc(s["link"][1]), ARROW))
        arts.append('<section id="%s" class="rv"><div class="narrow"><h2>%s</h2>'
                    '<div class="rule mid"></div>%s%s</div>%s%s</section>'
                    % (s["id"], esc(s["heading"]), paras, tags, fig, link))

    hero_img = page.get("hero") or "_v6a2931neu-cropped.jpg"
    body = ('<section class="phero"><div class="phero-bg"><img src="%s" alt="%s"></div>'
            '<div class="wrap"><p class="crumb">%s</p><h1>%s</h1><p>%s</p></div></section>'
            '<div class="art"><div class="wrap">%s</div></div>'
            '<section class="cband" style="margin-top:110px"><div class="wrap cband-g">'
            '<div class="rv"><p class="kicker pale">Termin</p>'
            '<h2>Passt eine dieser Behandlungen zu Ihnen?</h2>'
            '<p>Das klären wir im Gespräch. Rufen Sie an oder schreiben Sie mir.</p>'
            '<a class="btn pale" href="kontakt.html">Termin anfragen</a></div>'
            '<dl class="rv"><div><dt>Praxis</dt><dd>%s<br>%s %s</dd></div>'
            '<div><dt>Telefon</dt><dd><a href="tel:%s">%s</a></dd></div></dl>'
            '</div></section>'
            ) % (img(hero_img), esc(alt_for(hero_img)), crumb, esc(page["title"]), esc(page["lede"]),
                 "".join(arts), esc(C.PRACTICE["street"]), esc(C.PRACTICE["postcode"]),
                 esc(C.PRACTICE["city"]), C.PRACTICE["phone_link"], esc(C.PRACTICE["phone"]))
    return shell(slug, "%s · Sanare Naturalis Krefeld" % page["title"], page["lede"],
                 body, overlay=True, progress=True)


def page_aktuelles():
    arts = []
    for n in C.AKTUELLES:
        paras = "".join("<p>%s</p>" % esc(t) for t in n["paras"])
        dates = ""
        if n["dates"]:
            dates = '<div class="dates">%s</div>' % "".join(
                "<div><b>%s</b><span>%s</span></div>" % (esc(x), esc(y)) for x, y in n["dates"])
        arts.append('<article class="rv"><figure class="news-fig"><img src="%s" alt="%s" loading="lazy"></figure>'
                    '<div><p class="kicker">Angebot</p><h2>%s</h2><p class="tarif">%s</p>%s%s'
                    '<a class="lnk" href="kontakt.html">Termin anfragen %s</a></div></article>'
                    % (img(n["img"]), esc(alt_for(n["img"])), esc(n["heading"]),
                       esc(n["price"]), paras, dates, ARROW))
    body = ('<section class="phero"><div class="phero-bg"><img src="%s" alt=""></div>'
            '<div class="wrap"><p class="crumb"><a href="index.html">Home</a> · Aktuelles</p>'
            '<h1>Aktuelles</h1><p>Angebote und Kurse aus der Praxis.</p></div></section>'
            '<section class="news"><div class="wrap">%s</div></section>'
            ) % (img("haende-schoko-cropped.jpg"), "".join(arts))
    return shell("aktuelles", "Aktuelles · Sanare Naturalis Krefeld",
                 "Angebote und Kurse der Naturheilpraxis Sanare Naturalis in Krefeld.", body)


def page_kontakt():
    p = C.PRACTICE
    fields = []
    for fid, label, kind, req in C.CONTACT["form"]:
        star = " *" if req else ""
        r = " required" if req else ""
        if kind == "textarea":
            inp = '<textarea id="%s" name="%s"%s></textarea>' % (fid, fid, r)
        else:
            inp = '<input id="%s" name="%s" type="%s"%s>' % (fid, fid, kind, r)
        fields.append('<div class="field"><label for="%s">%s%s</label>%s</div>' % (fid, esc(label), star, inp))
    form = ('<form method="post" action="#" class="rv">'
            '<div class="field"><label for="anliegen">Anliegen</label>'
            '<select id="anliegen" name="anliegen">%s</select></div>%s'
            '<button class="btn solid" type="submit">%s</button></form>'
            ) % ("".join("<option>%s</option>" % esc(t["heading"]) for t in C.all_treatments()),
                 "".join(fields), esc(C.CONTACT["submit"]))
    info = ('<div class="kinfo rv"><p class="kicker">%s</p>'
            '<dl><div><dt>Adresse</dt><dd>%s<br>%s %s</dd></div>'
            '<div><dt>Mobil</dt><dd><a href="tel:%s">%s</a></dd></div>'
            '<div><dt>Termine</dt><dd>Nach Vereinbarung</dd></div></dl>'
            '<div class="kmap"><p>Uerdingerstr. 573 · 47800 Krefeld<br>'
            '<a href="https://www.openstreetmap.org/search?query=Uerdingerstr.%%20573%%2047800%%20Krefeld">'
            'Auf der Karte öffnen</a></p></div></div>'
            ) % (esc(C.CONTACT["heading"]), esc(p["street"]), esc(p["postcode"]), esc(p["city"]),
                 p["phone_link"], esc(p["phone"]))
    body = ('<section class="phero"><div class="phero-bg"><img src="%s" alt=""></div>'
            '<div class="wrap"><p class="crumb"><a href="index.html">Home</a> · Kontakt</p>'
            '<h1>Kontakt</h1><p>Schreiben Sie mir oder rufen Sie an. Ich melde mich zurück.</p>'
            '</div></section>'
            '<div class="wrap"><div class="kg">%s%s</div></div>'
            ) % (img("_v6a2931neu-cropped.jpg"), info, form)
    return shell("kontakt", "Kontakt · Sanare Naturalis Krefeld",
                 "Naturheilpraxis Sanare Naturalis, Uerdingerstr. 573, 47800 Krefeld.", body)


def page_impressum():
    m = C.IMPRESSUM
    lines = "<br>".join(esc(x) for x in m["lines"])
    facts = "".join("<dt>%s</dt><dd>%s</dd>" % (esc(a), esc(b)) for a, b in m["facts"])
    blocks = "".join("<h2>%s</h2><p>%s</p>" % (esc(a), esc(b)) for a, b in m["blocks"])
    body = ('<div class="wrap"><div class="legal narrow"><h1>Impressum</h1>'
            '<p>%s</p><address>%s</address><dl>%s</dl>%s</div></div>'
            ) % (esc(m["responsible"]), lines, facts, blocks)
    return shell("impressum", "Impressum · Sanare Naturalis Krefeld",
                 "Impressum der Naturheilpraxis Sanare Naturalis.", body, overlay=False)


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
