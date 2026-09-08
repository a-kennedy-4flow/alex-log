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
