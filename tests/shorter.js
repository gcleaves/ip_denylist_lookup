'use strict';
const shorter = require('shorter');

function compress(string) {
    console.log('before', string.length);
    const encoded = shorter.compress(string);
    console.log('after', encoded.length);           // 2
}

compress('{"type":"mno","name":"br_tim","source":"upstream"}');
