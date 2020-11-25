'use strict';

const Redis = require("ioredis");
const redis = new Redis({host:process.env.REDIS_HOST}); // uses defaults unless given configuration object
const express = require('express');
const app = express();
//const port = 3000;

function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

exports.serve = (port, redisPrefix) => {
    app.get('/favicon.ico', (req, res) => res.status(204).end());
    app.get('/:ip', async (req, res) => {
        let start = new Date();
        const ip = req.params.ip;
        console.log(`request [${ip}]`);
        const long = ip2int(ip);
        let response = [];

        redis.zrangebyscore(redisPrefix + 'ranges', long, '+inf', 'LIMIT', 0, 1).then(answer => {
            const item = answer[0];
            console.log(item);
            const [startInt, endInt, ...caca] = item.split(',');
            let end = new Date() - start;
            console.info('Execution time: %dms', end);
            if(long >= startInt && long <= endInt) {
                response = caca;
            }
            res.send(response);
        });
    });
    app.listen(port, () => {
        console.log(`IP ranges app listening at http://localhost:${port}`);
    });
};

