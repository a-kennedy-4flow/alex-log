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
