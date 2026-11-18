'use strict';

const copyWidget=document.getElementById('copyWidget');
const copyStatus=document.getElementById('copyStatus');
let widgetScript;

copyWidget.addEventListener('click',async()=>{
 try{
  await navigator.clipboard.writeText(widgetScript);
  copyStatus.textContent='Copied. Paste into Scriptable.';
 }catch{
  copyStatus.textContent='Use the Download link to copy the script manually.';
 }
});

// Load the script before the tap so Clipboard gets the user's activation.
fetch('/knot-widget.js').then(response=>{
 if(!response.ok)throw Error('Widget script unavailable');
 return response.text();
}).then(text=>{
 widgetScript=text;
 copyWidget.disabled=false;
}).catch(()=>{
 copyStatus.textContent='Use the Download link to get the script.';
});
