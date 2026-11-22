"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {envelope}=require('../src/bridge.js');
test('native bridge cannot evaluate title or chat template syntax',()=>{
 const payload={title:'`);globalThis.executed=true;//',messages:[{text:'${globalThis.executed=true} \\ ` <script>hi</script> 😀'}]};
 const encoded=envelope(payload);const context={};vm.createContext(context);
 vm.runInContext('result=String.raw`'+JSON.stringify(encoded)+'`',context);
 assert.equal(context.executed,undefined);assert.deepEqual(JSON.parse(decodeURIComponent(JSON.parse(context.result).encoded)),payload);
});
