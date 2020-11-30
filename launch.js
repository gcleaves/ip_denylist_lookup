'use strict';

const fs = require('fs');
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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const args = require('minimist')(process.argv.slice(2), {
    boolean: [
        'download',
        'load',
        'serve',
		'gc'
    ],
    default: {
        download: true,
        load: true,
        serve: true,
		gc: false
    }
});

const fireholLists = [
    'https://iplists.firehol.org/files/firehol_level2.netset',
    'https://iplists.firehol.org/files/firehol_level1.netset',
    'https://iplists.firehol.org/files/firehol_level3.netset',
    'https://iplists.firehol.org/files/firehol_level4.netset',
    'https://iplists.firehol.org/files/firehol_proxies.netset',
    'https://iplists.firehol.org/files/firehol_webclient.netset',
    'https://iplists.firehol.org/files/firehol_webserver.netset',
    'https://iplists.firehol.org/files/firehol_abusers_1d.netset',
    'https://iplists.firehol.org/files/firehol_abusers_30d.netset',
    'https://iplists.firehol.org/files/firehol_anonymous.netset'
];

const redisPrefix = process.env.IP_REDIS_PREFIX || 'ip_lists:';
const csvFile = process.env.IP_DOWNLOAD_LOCATION || './ipFile';
const includePath = './other_lists';

async function main() {
    if(args.download) {
        await redis.del(redisPrefix + 'lists');
        if(fireholLists.length) await redis.sadd(redisPrefix + 'lists', fireholLists).then(()=>redis.disconnect());
        await dl(csvFile,redisPrefix);
        //await sleep(10000);
        console.log("done downloading files");
    }
    if(args.load) {
        // load other files
        fs.readdirSync(includePath).forEach((file) => {
            const theFile = `${includePath}/${file}`;
            console.log(theFile);
            if(fs.lstatSync(theFile).isFile()) {
                fs.appendFileSync(csvFile, fs.readFileSync(theFile).toString())
            }
        });
        await load(csvFile, redisPrefix, args.gc);
        console.log("loading done.");
    }
    if(args.serve) {
        serve(process.env.IP_HTTP_PORT || 3000, redisPrefix, process.env.IP_PREFIX || '/');
    }
}

const job = new CronJob(process.env.IP_CRON || '5 2 * * *', async function() {
    await dl(csvFile, redisPrefix);
    console.log("done downloading files");

    // load other files
    fs.readdirSync(includePath).forEach((file) => {
        const theFile = `${includePath}/${file}`;
        console.log(theFile);
        if(fs.lstatSync(theFile).isFile()) {
            fs.appendFileSync(csvFile, fs.readFileSync(theFile).toString())
        }
    });

    await load(csvFile, redisPrefix, args.gc);
    console.log("loading done.");
});
job.start();

main();

