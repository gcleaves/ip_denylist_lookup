'use strict';
const snappy = require('snappy');

function compress(string) {
    console.log('before',string.length);
    const compressed = snappy.compressSync(string);
    console.log('after',compressed.length);
}


compress('{"type":"mno","name":"br_tim","source":"upstream"}');
