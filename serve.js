'use strict';

const Redis = require("ioredis");
const redis = new Redis({
    host:process.env.REDIS_HOST,
    port: process.env.REDIS_PORT, // Redis port
    family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
    password: process.env.REDIS_PASS,
    db: process.env.REDIS_DB,
});
const express = require('express');
const app = express();
const router = express.Router();
//const port = 3000;

function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

exports.serve = (port, redisPrefix, prefix) => {
    prefix = prefix || '/';
    router.get('/favicon.ico', (req, res) => res.status(204).end());
    router.get('/:ip', async (req, res) => {
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
    app.use(prefix, router);
    app.listen(port, () => {
        console.log(`IP ranges app listening at http://localhost:${port}${prefix}`);
    });
};

