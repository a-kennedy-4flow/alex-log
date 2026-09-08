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
