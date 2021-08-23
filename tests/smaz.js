'use strict';
const smaz = require('@remusao/smaz');

function compress(string) {
    console.log('before', string.length);
    const encoded = smaz.compress(string);
    console.log('after', encoded.length);
    console.log('after', encoded.toString('binary'));
}

compress('{"type":"mno","name":"br_tim","source":"upstream"}');
