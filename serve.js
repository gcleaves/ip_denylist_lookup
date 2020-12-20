'use strict';

const ipTools = require('ip-utils');
const Redis = require("ioredis");
const redis = new Redis({
    host:process.env.REDIS_HOST,
    port: process.env.REDIS_PORT, // Redis port
    family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
    password: process.env.REDIS_PASS,
    db: process.env.REDIS_DB,
});
const express = require('express');
const readline = require('readline');
const stream = require('stream');
const app = express();
const fileUpload = require('express-fileupload');
const router = express.Router();
app.use(express.json({limit: '10mb'}));
app.use(express.text({limit: '10mb'}));
const maxUpload = 10 * 1024 * 1024; // 10MB
app.use(fileUpload({
    limits: { fileSize: maxUpload},
}));
let redisPrefix;

const lookupIP = (ip) => {
    let response;
    const message = "%s:%s";

    return new Promise(((resolve, reject) => {
        if(! ipTools.isValidIpv4(ip)) {
            //console.log(message, ip, 'error');
            resolve(false);
        }
        const long = ipTools.toLong(ip);
        redis.zrangebyscore(redisPrefix + 'ranges', long, '+inf', 'LIMIT', 0, 1).then(answer => {
            const item = answer[0];
            const [startInt, endInt, lists] = item.split('|');
            if (long >= startInt && long <= endInt) {
                response = JSON.parse(lists);
                //console.log(message, ip, response);
                resolve(response, ip);
            }
            //console.log(message, ip, '');
            resolve(null);
        });
    }));
};

exports.serve = (port, rp, prefix) => {
    redisPrefix = rp;
    prefix = prefix || '/';
    router.get('/', (req, res) => res.redirect('/myip'));

    router.get(['/help','/docs'], (req,res) => res.redirect('https://documenter.getpostman.com/view/212281/TVmQcarE'));

    router.get('/favicon.ico', (req, res) => res.status(204).end());

    router.post('/', async (req,res) => {
        const response = {};
        let ips = [];
        if(Object.keys(req.body).length === 0) {
            res
                .status(422)
                .send('missing body');
            return;
        }
        if(req.is('application/json')) {
            ips = req.body;
        } else {
            ips = req.body.split(/,|\r?\n/);
        }

        await Promise.all(ips.map(async ip => {
            const list = await lookupIP(ip);
            response[ip] = (list===null) ? [] : list;
        }));

        res.json(response);

        // if(req.is('application/json')) {
        //     res.json(response);
        // } else {
        //     for (const ip in response) {
        //         let lists = 'error';
        //         if(Array.isArray(response[ip])) {
        //             lists = response[ip].join('|');
        //         }
        //         res.write(`${ip},${lists}\n`);
        //     }
        //     res.end();
        // }
    });

    router.get('/upload',(req, res) => {
        res.send(`
<html>
  <body>
    <p>Max upload: ${maxUpload / 1024 / 1024} MB (reverse proxy may set lower limit)</p>
    <p>Upload a line/comma separated list of IPs, or a JSON array with a .json file extension.</p>
    <form ref='uploadForm' 
      id='uploadForm'  
      method='post' 
      encType="multipart/form-data">
        <input type="file" name="ipList" />
        <input type='submit' value='Upload!' />
    </form>     
  </body>
</html>`);
    });

    router.post('/upload', async function(req, res) {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).send('No files were uploaded.');
        }
        const fileAsString = req.files.ipList.data.toString();
        const response = {};

        let contentType;
        let fileName;
        let ips = [];
        if(req.files.ipList.name.match(/\.json$/)) {
            ips = JSON.parse(fileAsString);
            // contentType = 'application/json';
            // fileName = 'ips.json';
        } else {
            ips = fileAsString.split(/,|\r?\n/);
            // contentType = 'text/csv';
            // fileName = 'ips.csv';
        }

        contentType = 'application/json';
        fileName = 'ips.json';

        await Promise.all(ips.map(async ip => {
            const list = await lookupIP(ip);
            response[ip] = (list===null) ? [] : list;
        }));
        res.header('Content-Type', contentType);
        res.attachment(fileName);

        res.send(JSON.stringify(response));

    });

    router.get('/myip', (req, res) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const response = {};
        response.origin = ip;
        lookupIP(ip).then( result => {
            response.result = result;
            res.send(response);
        })
    });

    router.get('/:ip', (req, res) => {
        let start = new Date();
        const ip = req.params.ip;
        let message = `${ip}:`;
        let response = [];

        lookupIP(ip).then( ipLists => {
            if(ipLists===false) {
                res.status(422);
                response = 'invalid ipv4';
            } else if (ipLists===null) {
                res.status(404);
            } else {
                response = ipLists;
            }
            message += response;
            res.json(response);
            //console.log(message);
        });
    });

    app.use(prefix, router);
    app.listen(port, () => {
        console.log(`IP ranges app listening at http://localhost:${port}${prefix}`);
    });
};

