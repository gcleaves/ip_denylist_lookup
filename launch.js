'use strict';

const fs = require('fs');
const CronJob = require('cron').CronJob;
const args = require('minimist')(process.argv.slice(2), {
    boolean: [
        'download',
        'load',
        'serve',
		'gc',
        'process'
    ],
    default: {
        download: true,
        load: true,
        serve: true,
        process: true,
		collectGarbage: false
    }
});

const redisPrefix = process.env.IP_REDIS_PREFIX || 'ip_lists:';
const csvFile = process.env.IP_DOWNLOAD_LOCATION || './ipFile';
const collectGarbage = process.env.IP_COLLECT_GARBAGE || args.collectGarbage;
const includePath = __dirname + '/staging';

const concat = async (sourceFile, destination) => {
    console.log(`concatenating ${sourceFile}`);
    return new Promise((resolve, reject) => {
        const source = fs.createReadStream(sourceFile);
        source.on('close', function() {
            console.log("finished writing " + sourceFile);
            resolve();
        });
        source.pipe(destination);
    });
}

async function main() {
    // run plugins which stage IP lists
    if(args.download) {
        const plugins = require('./plugins');
        const results = await Promise.allSettled(plugins.map(p=>p.load));
        let k = 0;
        for(const result of results) {
            if(result.status==='rejected' && plugins[k].abortOnFail===true) {
                console.error(`Abort: plugin [${plugins[k].name}] has been set to abort process on fail.`);
                throw result.reason;
            }
            k++;
        }
        console.log("plugins done.");
        console.log(results);
    }

    if(args.process) {
        // concatenate staging lists into 1 file
        fs.writeFileSync(csvFile,"start_int|end_int|list\n");

        for(const file of fs.readdirSync(includePath)) {
            const theFile = `${includePath}/${file}`;
            if(file.match(/^\./)) {
                console.log(`skipping ${theFile}`);
                continue;
            }
            const destination = fs.createWriteStream(csvFile, {flags: 'a'});
            await concat(theFile, destination);
        }
    }

    if(args.load) {
        const load = require('./loadToRedis').load;
        await load(csvFile, redisPrefix, collectGarbage);
        console.log("loading done.");
    }

    return 'success';
}

if(args.serve) {
    const serve = require('./serve').serve;
    serve(process.env.IP_HTTP_PORT || 3000, redisPrefix, process.env.IP_PREFIX || '/');
}

const job = new CronJob(process.env.IP_CRON || '5 2 * * *', async function() {
    main();
});
job.start();

main().then(()=>console.log("ready to serve!"));

