const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const ip = require('ip-utils');
const path = require('path');
const util = require('util');
const Redis = require("ioredis");


function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}
async function downloadFile(fileUrl, outputLocationPath, tag) {
	console.log('starting ' + fileUrl);
    const writer = fs.createWriteStream(outputLocationPath,{flags:'a'});
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    }).then(response => {
        return new Promise((resolve, reject) => {
            let error = null;
            readline.createInterface({
                input: response.data
            }).on('line', data => {
                let line;
                if(data[0]==='#') return;
                const format = `%s,%s,%s\n`;
                if(data.includes('/')) {
                    //console.log(ip.cidrInfo(data));
                    const cidrInfo = ip.cidrInfo(data);
                    line = util.format(format, Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)), Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)), tag);
                } else {
                    line = util.format(format, ip2int(data), ip2int(data), tag);
                }
                //console.log(line);
                writer.write(line);
            }).on('error',(e) => {
                error = e;
                writer.close();
                reject(e);
            }).on('close',()=> {
                if (!error) {
					console.log('finished ' + fileUrl);
                    resolve(true);
                }
            });
        });
    });
}

exports.downloadLists = async (outputFile, redisPrefix) => {
    const redis = new Redis({
        host:process.env.REDIS_HOST,
        port: process.env.REDIS_PORT, // Redis port
        family: process.env.REDIS_IP_FAMILY, // 4 (IPv4) or 6 (IPv6)
        password: process.env.REDIS_PASS,
        db: process.env.REDIS_DB,
    });
    const listArray = await redis.smembers(redisPrefix + 'lists');
    fs.writeFileSync(outputFile, "start_int,end_int,list\n");
    return Promise
        .all(listArray.map( f => downloadFile(f, outputFile, path.posix.basename(f).replace(/\.(?:ip|net)set/,""))))
};
