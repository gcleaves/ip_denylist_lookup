'use strict';
const csv = require('csv-parser');
const fs = require('fs');
const Redis = require("ioredis");
const { format} = require('date-fns');

function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

exports.load = (file, redisPrefix) => {
    let k = 0;
    const scratch = [];
    return new Promise((resolve, reject) => {
        const redis = new Redis({
            host:process.env.REDIS_HOST,
            port: process.env.REDIS_PORT, // Redis port
            family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
            password: process.env.REDIS_PASS,
            db: process.env.REDIS_DB,
        }); // uses defaults unless given configuration object
        const tempKey = 'arfa45e13grh785gEV4wfw$WF7h';
        redis.del(tempKey);
        fs.createReadStream(file, {endX: 10000})
            .pipe(csv({
                separator: ',',
                mapValues: ({header, index, value}) => {
                    if (header === 'list') {
                        return value.trim()
                    } else {
                        return parseInt(value);
                    }
                }
            }))
            .on('data', (r) => {
                k++;
                if (!(k % 10000)) {
                    //process.stdout.write(`reading CSV line: ${k}\r`);
                    console.log(`reading CSV line: ${k}`);
                }
                scratch.push({n: r.start_int, a: r.list, e: false});
                scratch.push({n: r.end_int, a: r.list, e: true});
            })
            .on('end', async () => {
                redis.lpush(redisPrefix + 'ipListSize', JSON.stringify({
                    "date": format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
                    "size": k,
                    "lists": await redis.smembers(redisPrefix + 'lists')
                }));
                console.log('CSV file successfully processed %s lines', k);
                console.log(scratch.length);
                console.log('Sorting...');
                scratch.sort((a, b) => {
                    if (a.n < b.n) return -1;
                    if (a.n > b.n) return 1;
                    if (a.e < b.e) {
                        return -1
                    }
                    if (a.e > b.e) {
                        return 1
                    }
                    return 0;
                });
                console.log('Sorting finished');

                let s = [];
                let n;
                let m;

                let pipeline = redis.pipeline();
                for (let k = 0; k < scratch.length - 1; k++) {
                    if (!(k % 10000)) {
                        //process.stdout.write(`flattening ${k} of ${scratch.length}\r`);
                        console.log(`flattening ${k} of ${scratch.length}`);
                    }
                    if (!(k % 100000)) {
                        pipeline.exec();
                        pipeline = redis.pipeline(); //.client('reply', 'off');
                    }
                    let cur = scratch[k];
                    let nex = scratch[k + 1];
                    if (cur.e === false) {
                        s.push(cur.a);
                    } else {
                        let index = s.indexOf(cur.a);
                        if (index > -1) s.splice(index, 1);
                    }
                    if (cur.e === false) {
                        n = cur.n;
                    } else {
                        n = cur.n + 1;
                    }
                    if (nex.e === false) {
                        m = nex.n - 1;
                    } else {
                        m = nex.n;
                    }

                    if (n <= m && s.length) {
                        pipeline.zadd(tempKey, m, `${n},${m},${s.join(',')}`);
                    }
                }
                await pipeline.exec();
                await redis.rename(tempKey, redisPrefix + 'ranges');
                await redis.del(tempKey);

                redis.client('reply','on').then( a=> {
                    redis.disconnect();
                    resolve();
                });
            });
    });
};

