'use strict';
const { Worker, isMainThread,  workerData, parentPort } = require('worker_threads');
const pluginName = 'load_to_redis';

if(isMainThread) {
    exports.load = (file, redisPrefix, gc) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: {file, redisPrefix, gc},
                execArgv: ['--unhandled-rejections=strict']
            });
            worker.on("message", data=>resolve(data));
            worker.on("error", error=>{
                reject(error)
            });
            worker.on("exit", code=>console.log(`${pluginName} exited with code: ${code}`));
        });
    };
} else {
    const csv = require('csv-parser');
    const fs = require('fs');
    const Redis = require("ioredis");
    const { format} = require('date-fns');
    const nowFormat = () => format(new Date(),'yyyy-MM-dd HH:mm:ss');

    function forceGC() {
        if (global.gc) {
            global.gc();
        } else {
            console.warn('No GC hook! Start your program as `node --expose-gc file.js`.');
        }
    }

    function ip2int(ip) {
        return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    }

    const main = (file, redisPrefix, gc) => {
        //console.log('gc=%s',gc);
        let k = 0;
        const scratch = [];
        return new Promise((resolve, reject) => {
            const redis = new Redis({
                host:process.env.REDIS_HOST,
                port: process.env.REDIS_PORT, // Redis port
                family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
                password: process.env.REDIS_PASS,
                db: process.env.REDIS_DB,
                retryStrategy(times) {
                    const delay = Math.min(times * 500, 10000);
                    console.error("ioredis delay ms: " + delay);
                    if(times > 20) throw Error("too many redis reconnect attempts");
                    return delay;
                },
                maxRetriesPerRequest: null // don't skip any commands, wait until redis is online again
            }); // uses defaults unless given configuration object
            const tempKey = 'arfa45e13grh785gEV4wfw$WF7h';
            redis.del(tempKey);
            fs.createReadStream(file, {endX: 10000})
                .pipe(csv({
                    separator: '|',
                    quote: '~',
                    mapValues: ({header, index, value}) => {
                        if (header === 'list') {
                            //if(!value || value=='') return 'unknown';
                            //return value.trim();
                            return value;
                        } else {
                            return parseInt(value);
                        }
                    }
                }))
                .on('data', (r) => {
                    //console.log(r);
                    k++;
                    if (!(k % 10000)) {
                        //process.stdout.write(`reading CSV line: ${k}\r`);
                        console.log(nowFormat() + `| reading CSV line: ${k}`);
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
                    console.log(nowFormat() + '| CSV file successfully processed %s lines', k);
                    console.log(nowFormat() + "| " + scratch.length);
                    console.log(nowFormat() + '| Sorting...');
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
                    console.log(nowFormat() + '| Sorting finished');
                    //console.log(scratch);

                    let s = [];
                    let n;
                    let m;

                    let pipeline = redis.pipeline();
                    for (let k = 0; k < scratch.length - 1; k++) {
                        if (!(k % 10000)) {
                            //process.stdout.write(`flattening ${k} of ${scratch.length}\r`);
                            console.log(nowFormat() + `| flattening ${k} of ${scratch.length}`);
                        }
                        if (!(k % 100000)) {
                            try {
                                await pipeline.exec((error, results) => {
                                    if(error) console.log("ERROR ERROR 1: " + error.message);
                                });
                            } catch (error) {
                                console.log("ERROR ERROR 2: " + error.message);
                            }

                            if(gc) forceGC();
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
                            s = [...new Set(s)];
                            //console.log(s);

                            let data = {}; // geo: [], list: [], asn: []
                            for(const i of s) {
                                //console.log(i);
                                const j = JSON.parse(i);
                                const type = j.type;
                                delete j.type;
                                //console.log(j);
                                if(!data[type]) data[type] = [];
                                data[type].push(j);
                            }

                            try {
                                pipeline.zadd(tempKey, m, `${n}|${m}|${JSON.stringify(data)}`);
                            } catch (error) {
                                console.log("ERROR ERROR 3: " + error.message);
                            }
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

    main(workerData.file, workerData.redisPrefix, workerData.gc)
        .then(data => parentPort.postMessage(`${pluginName} done.`))
        .catch(error => {throw error});
}


