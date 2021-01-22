const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const ip = require('ip-utils');
const path = require('path');
const util = require('util');

function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}
function randomIntFromInterval(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min);
}
async function downloadFile(fileUrl, writer, tag) {
    await new Promise((resolve,reject)=>setTimeout(_=>resolve(),randomIntFromInterval(0,10)*1000));
	
	console.log('starting ' + fileUrl);
    const meta = {
        type: "list",
        name: tag,
        source: "firehol"
    };
    const metadata = JSON.stringify(meta);
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
        timeout: 20000
    }).then(response => {
        return new Promise((resolve, reject) => {
            let error = null;
            readline.createInterface({
                input: response.data
            }).on('line', data => {
                let line;
                if(data[0]==='#') return;
                const format = `%s|%s|%s\n`;
                if(data.includes('/')) {
                    //console.log(ip.cidrInfo(data));
                    const cidrInfo = ip.cidrInfo(data);
                    line = util.format(format, Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),
                        Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)), metadata);
                } else {
                    line = util.format(format, ip2int(data), ip2int(data), metadata);
                }
                //console.log(line);
                writer.write(line);
            }).on('error',(e) => {
                error = e;
                writer.close();
                reject("firehol failure: " + e.message);
            }).on('close',()=> {
                if (!error) {
                    console.log('finished ' + fileUrl);
                    resolve(true);
                }
            });
        });
    }).catch(error=>{throw Error(`firehol error code ${error.code} with file ${fileUrl}: ${error.message}`)});
}

module.exports = async (outputFile, listArray) => {
    const interval = setInterval(()=>console.log("still working on firehol"),5000);
	try {
	    fs.unlinkSync(outputFile);
    } catch (err) {
	    console.warn("can't delete " + outputFile);
    }
    return new Promise(async (resolve, reject) => {
        const writer = fs.createWriteStream(outputFile,{flags:'a'});
        writer.on('close', () => {
            console.log('firehol writer closed');
            clearInterval(interval);
            resolve("firehol");
        });
        writer.on('error', () => {
            clearInterval(interval);
            console.error('firehol error.');
            reject("firehol failed");
        });

        let timeout = false;
        await Promise.race([
            Promise
                .all(listArray.map( f => downloadFile(f, writer, path.posix.basename(f).replace(/\.(?:ip|net)set/,"")))),
            new Promise((resolve, reject) => {
                setTimeout(()=>{
                    timeout = true;
                    resolve();
                },10 * 60 * 1000)
            })
        ]).catch(error=>{
			clearInterval(interval);
			console.error(error);
			reject(error);
		});
        if (timeout) {
            clearInterval(interval);
			console.error("firehol timeout");
			reject("firehol timeout");
            //throw Error("firehol_worker timeout");
        }
		writer.close();
    });
};
