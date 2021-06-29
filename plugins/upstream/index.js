'use strict';
const { Worker, isMainThread,  workerData, parentPort } = require('worker_threads');
const pluginName = 'upstream';

if(isMainThread) {
    module.exports = (outputFile) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(__filename, {
                workerData: {outputFile},
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
    const path = require('path');
    const fs = require('fs');
    const csv = require('csv');
    const ip = require('ip-utils');
    const parse = require('csv-parser');
    const stringify = require('csv-stringify/lib/sync');

    let interval;

    const ip2int = (ip) => {
        return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    };

    const processRanges = async (outputFile) => {
        console.log('processing Upstream ranges');
        const fileName = path.join(__dirname,'ranges.txt');
        const readStream = fs.createReadStream(fileName); // readStream is a read-only stream wit raw text content of the CSV file
        const writeStream = fs.createWriteStream(outputFile); // writeStream is a write-only stream to write on the disk
        const csvStream = csv.parse({ delimiter: ',', columns: true }); // csv Stream is a read and write stream : it reads raw text in CSV and output untransformed records

        return new Promise(((resolve, reject) => {
            csvStream.on("data", function(r) {
                const cidrInfo = ip.cidrInfo(r.network);
                const meta = {
                    type: "mno",
                    name: r.mno,
                    source: "upstream"
                };

                const output = stringify([[Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),
                    Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),meta]], {delimiter: '|',quote: '|'}); //

                writeStream.write(output);

            }).on("end", function(){
                console.log(`${pluginName} done.`);
                clearInterval(interval);
                resolve(pluginName);
            }).on("error", function(error){
                console.log(error);
                clearInterval(interval);
                reject(`${pluginName} failed: ` + error.message);
            });
            readStream.pipe(csvStream);
        }));
    };

    const main = async (outputFile) => {
        try {
            interval = setInterval(()=>console.log(`still working on ${pluginName}`),5000);
            return processRanges(outputFile); // .then(()=>clearInterval(interval))
        } finally {}
    };

    main(workerData.outputFile)
        .then(data => parentPort.postMessage(`${pluginName} done.`))
        .catch(error => {throw error});
}
