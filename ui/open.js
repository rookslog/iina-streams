"use strict";
// The Open Stream window (#50). Global parses the input and answers only when it is invalid.
(function(){
 const form=document.getElementById('open-form');
 const field=document.getElementById('open-input');

 function focusField(){
  field.focus();
 }

 function submit(event){
  event.preventDefault();
  const input=field.value;
  if(!input.trim())return;
  iina.postMessage('open-stream',{input});
 }

 // The rejected text stays in the field for correction.
 function markInvalid(){
  field.setAttribute('aria-invalid','true');
  focusField();
 }

 function onKeyDown(event){
  if(event.key!=='Escape')return;
  event.preventDefault();
  iina.postMessage('open-cancel',{});
 }

 form.addEventListener('submit',submit);
 field.addEventListener('input',()=>field.removeAttribute('aria-invalid'));
 document.addEventListener('keydown',onKeyDown);
 window.addEventListener('focus',focusField);
 iina.onMessage('open-error',markInvalid);
 focusField();
})();
