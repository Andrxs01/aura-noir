"use strict";
(function(){
  var root=document.documentElement, $=function(s){return document.querySelector(s)};
  // Tema claro/oscuro
  var saved=null; try{saved=localStorage.getItem("an_theme")}catch(e){}
  root.setAttribute("data-theme", saved || (matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"));
  $("#theme").onclick=function(){
    var n=root.getAttribute("data-theme")==="dark"?"light":"dark"; root.setAttribute("data-theme",n);
    try{localStorage.setItem("an_theme",n)}catch(e){}
  };
  // Botones que navegan a otra sección
  document.querySelectorAll("[data-go]").forEach(function(b){
    b.addEventListener("click",function(){var t=document.querySelector('.tab[data-t="'+b.dataset.go+'"]'); if(t) t.click();});
  });
  // Al cambiar de pestaña: subir al inicio y mantener visible la pestaña activa
  document.querySelectorAll(".tab").forEach(function(t){
    t.addEventListener("click",function(){window.scrollTo({top:0});t.scrollIntoView({inline:"center",block:"nearest"});});
  });
  // Sugerencias de consulta
  document.querySelectorAll(".sug").forEach(function(b){
    b.onclick=function(){$("#q").value=b.textContent; $("#cf").requestSubmit();};
  });
  // Tras calcular, llevar la vista al resultado en pantallas pequeñas
  $("#f").addEventListener("submit",function(){
    if(innerWidth<860) setTimeout(function(){$("#out").scrollIntoView({behavior:"smooth",block:"start"});},60);
  });
})();
