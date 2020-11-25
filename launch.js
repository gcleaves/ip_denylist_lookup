'use strict';

const Redis = require("ioredis");
const redis = new Redis({
    host:process.env.REDIS_HOST,
    port: process.env.REDIS_PORT, // Redis port
    family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
    password: process.env.REDIS_PASS,
    db: process.env.REDIS_DB,
});
const CronJob = require('cron').CronJob;
const dl = require('./downloadLists').downloadLists;
const load = require('./loadToRedis').load;
const serve = require('./serve').serve;

const fireholLists = [
    'https://iplists.firehol.org/files/firehol_level2.netset',
    'https://iplists.firehol.org/files/firehol_level1.netset',
    // 'https://iplists.firehol.org/files/firehol_level3.netset',
    // 'https://iplists.firehol.org/files/firehol_level4.netset',
    // 'https://iplists.firehol.org/files/firehol_proxies.netset',
    // 'https://iplists.firehol.org/files/firehol_webclient.netset',
    // 'https://iplists.firehol.org/files/firehol_webserver.netset',
    // 'https://iplists.firehol.org/files/firehol_abusers_1d.netset',
    // 'https://iplists.firehol.org/files/firehol_abusers_30d.netset',
    // 'https://iplists.firehol.org/files/firehol_anonymous.netset'
];

const redisPrefix = process.env.IP_REDIS_PREFIX || 'ip_lists:';
const csvFile = process.env.IP_DOWNLOAD_LOCATION || './ipFile';

async function main() {
    await redis.del(redisPrefix + 'lists');
    await redis.sadd(redisPrefix + 'lists', fireholLists).then(()=>redis.disconnect());
    await dl(csvFile,redisPrefix);
    console.log("done downloading files");
    await load(csvFile, redisPrefix);
    console.log("loading done.");
    serve(process.env.IP_HTTP_PORT || 3000, redisPrefix);
}

const job = new CronJob(process.env.IP_CRON || '1 3 * * *', async function() {
    await dl(csvFile, redisPrefix);
    console.log("done downloading files");
    await load(csvFile, redisPrefix);
    console.log("loading done.");
});
job.start();

main();

