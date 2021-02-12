//TODO: bring sanity to CSV. DRY and option to get JSON or CSV results during upload independant of upload file

'use strict';

const ipTools = require('ip-utils');
const Redis = require("ioredis");
const config = require("./config.json");
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
const stringifySync = require('csv/lib/sync').stringify;
const stringify = require('csv').stringify;
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
const columns = ['ip','list','country','asn'];

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
	    if(!item) {
		    reject(new Error("not ready"));
		    return;
	    }
	    const [startInt, endInt, lists] = item.split('|');
            if (long >= startInt && long <= endInt) {
                response = JSON.parse(lists);
                resolve(response, ip);
            }
            resolve(null);
        });
    }));
};

exports.serve = (port, rp, prefix) => {
    redisPrefix = rp;
    prefix = prefix || '/';
    router.get('/', (req, res) => res.redirect('/myip'));

    router.get(['/help','/docs'], (req,res) => res.redirect(config.docs_url));

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

        //res.json(response);
        if([1,'1',true,'true'].includes(req.query.csv)) {
            // console.log('post csv');
            // console.log(response);
            res.header('Content-Type', 'text/plain');
            const header = (![0, '0', false, 'false'].includes(req.query.header));

            const stringifier = stringify({columns: columns, header: header});
            stringifier.on('readable', function(){
                let row;
                while(row = stringifier.read()){
                    res.write(row);
                }
            });
            stringifier.on('error', function(err){
                console.error(err.message)
            })
            stringifier.on('finish',() => res.end());

            for (const ip in response) {
                let lists = '', countries = '', asns = '';
                if(response[ip].list) lists = response[ip].list.map(l => l.name).join('|');
                if(response[ip].geo) countries = response[ip].geo.map(l => l.country).join('|');
                if(response[ip].asn) asns = response[ip].asn.map(l => l.name).join('|');
                stringifier.write([ip,lists,countries,asns]);
            }
            stringifier.end();
        } else {
            res.json(response);
        }
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
        let stringifier;
        let fileType;
        if(req.files.ipList.name.match(/\.json$/)) {
            fileType = 'json';
            ips = JSON.parse(fileAsString);
            contentType = 'application/json';
            fileName = 'ips.json';
        } else {
            fileType = 'csv';
            ips = fileAsString.split(/,|\r?\n/);
            contentType = 'text/csv';
            fileName = 'ips.csv';
            const header = (![0, '0', false, 'false'].includes(req.query.header));

            stringifier = stringify({columns: columns, header: header});
            stringifier.on('readable', function(){
                let row;
                while(row = stringifier.read()){
                    res.write(row);
                }
            });
            stringifier.on('error', function(err){
                console.error(err.message)
            })
            stringifier.on('finish',() => res.end());
        }

        res.header('Content-Type', contentType);
        res.attachment(fileName);
        await Promise.all(ips.map(async ip => {
            const list = await lookupIP(ip);
            response[ip] = (list===null) ? [] : list;

            if(fileType==='csv') {
                let lists = '', countries = '', asns = '';
                if (response[ip].list) lists = response[ip].list.map(l => l.name).join('|');
                if (response[ip].geo) countries = response[ip].geo.map(l => l.country).join('|');
                if (response[ip].asn) asns = response[ip].asn.map(l => l.name).join('|');
                stringifier.write([ip,lists,countries,asns]);
            }
        }));
        if(fileType==='csv') stringifier.end();
        else res.send(JSON.stringify(response));

    });

    router.get('/myip', (req, res) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const response = {};
        response.ip = ip;
        lookupIP(ip).then( ipLists => {
            response.result = ipLists || {};

            if([1,'1',true,'true'].includes(req.query.csv)) {
                const header = (![0, '0', false, 'false'].includes(req.query.header));
                res.header('Content-Type', 'text/plain');

                let lists = '', countries = '', asns = '';
                if(ipLists.list) lists = ipLists.list.map(l => l.name).join('|');
                if(ipLists.geo) countries = ipLists.geo.map(l => l.country).join('|');
                if (ipLists.asn) asns = ipLists.asn.map(l => l.name).join('|');
                stringify([[ip,lists,countries,asns]],{columns: columns, header: header},(err,output) => res.send(output));
            } else {
                res.json(response);
            }
        }).catch((e) => {
            res.status(503);
            res.send(e.message);
        });
    });

    router.get('/:ip', (req, res) => {
        const ip = req.params.ip;
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

            if([1,'1',true,'true'].includes(req.query.csv)) {
                const header = (![0, '0', false, 'false'].includes(req.query.header));
                res.header('Content-Type', 'text/plain');

                let lists = '', countries = '', asns = '';
                if(ipLists.list) lists = ipLists.list.map(l => l.name).join('|');
                if(ipLists.geo) countries = ipLists.geo.map(l => l.country).join('|');
                if(ipLists.asn) asns = ipLists.asn.map(l => l.name).join('|');
                stringify([[lists,countries,asns]],{columns: columns, header: header},(err,output) => res.send(output));
            } else {
                res.json(response);
            }
        }).catch((e) => {
	    res.status(503);
	    res.send(e.message);
	});
    });

    app.use(prefix, router);
    app.listen(port, () => {
        console.log(`IP ranges app listening at http://localhost:${port}${prefix}`);
    });
};

