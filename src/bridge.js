"use strict";
// IINA 1.5.1 interpolates native messages into a JavaScript template literal.
// Keep untrusted strings outside that grammar by percent-encoding the full JSON.
function envelope(value){return{encoded:encodeURIComponent(JSON.stringify(value))};}
module.exports={envelope};
