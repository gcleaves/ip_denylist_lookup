'use strict';
const { Worker, isMainThread,  workerData, parentPort } = require('worker_threads');
const pluginName = 'firehol';

if(isMainThread) {
    module.exports = (outputFile, listArray) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: {outputFile, listArray},
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
    console.log("firehol isMainThread: " + isMainThread);
    const axios = require('axios');
    const fs = require('fs');
    const readline = require('readline');
    const ip = require('ip-utils');
    const path = require('path');
    const util = require('util');

    function ip2int(ip) {
        return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    }
    async function downloadFile(fileUrl, writer, tag) {
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
            timeout: 10000
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

    //throw Error("pipiE");

    const main = async (outputFile, listArray) => {
        const interval = setInterval(()=>console.log("still working on firehol"),5000);
        try {
            fs.unlinkSync(outputFile);
        } catch (err) {
            console.warn("can't delete " + outputFile);
        }

        const writer = fs.createWriteStream(outputFile,{flags:'a'});
        writer.on('close', () => {
            console.log('firehol writer closed');
            clearInterval(interval);
            //resolve("firehol");
            parentPort.postMessage("firehol");
            process.exit();
        });
        writer.on('error', () => {
            clearInterval(interval);
            console.error('firehol error.');
            //reject("firehol failed");
            throw Error("firehol failed");
        });

        let timeout = false;
        await Promise.race([
            Promise
                .all(listArray.map( f => downloadFile(f, writer, path.posix.basename(f).replace(/\.(?:ip|net)set/,"")))),
            new Promise((resolve, reject) => {
                setTimeout(()=>{
                    timeout = true;
                    resolve();
                },5 * 60 * 1000)
            })
        ]);
        if (timeout) throw Error("firehol_worker timeout");
        writer.close();
    };

    main(workerData.outputFile, workerData.listArray);

}

