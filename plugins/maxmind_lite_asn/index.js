// curl -I 'https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country-CSV&license_key={key}&suffix=zip'

'use strict';
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const csv = require('csv');
const ip = require('ip-utils');
const unzipper = require('unzipper');
const parse = require('csv-parser');
const stringify = require('csv-stringify/lib/sync');
const config = require('./config.json');
const zipFile = path.join(__dirname,'maxmind_asn.zip');
let interval;

const ip2int = (ip) => {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

const downloadMaxmind = async () => {
    console.log("downloading maxmind_lite_asn");
    const writer = fs.createWriteStream(zipFile);
    const response = await axios({
        method: 'get',
        url: `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN-CSV&license_key=${config.apiKey}&suffix=zip`,
        responseType: 'stream'
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

const extract = () => {
    return new Promise(((resolve, reject) => {
        fs.createReadStream(zipFile)
            .pipe(unzipper.Parse())
            .on('entry', function (entry) {
                const fileName = entry.path;
                const type = entry.type; // 'Directory' or 'File'
                const size = entry.vars.compressedSize; // There is also compressedSize;
                //console.log([fileName, type, size]);
                if (/GeoLite2-ASN-Blocks-IPv4/.test(fileName)) {
                    const basename = path.basename(fileName);
                    console.log('extracting '+ fileName);
                    entry.pipe(fs.createWriteStream(path.join(__dirname,basename)));
                } else {
                    entry.autodrain();
                }
            })
            .on('close',()=>resolve());
    }));
};

const processRanges = async (outputFile) => {
    console.log('processing asn ranges');
    const fileName = path.join(__dirname,'GeoLite2-ASN-Blocks-IPv4.csv');
    const readStream = fs.createReadStream(fileName); // readStream is a read-only stream wit raw text content of the CSV file
    const writeStream = fs.createWriteStream(outputFile); // writeStream is a write-only stream to write on the disk
    const csvStream = csv.parse({ delimiter: ',', columns: true }); // csv Stream is a read and write stream : it reads raw text in CSV and output untransformed records

    return new Promise(((resolve, reject) => {
        csvStream.on("data", function(r) {
            const cidrInfo = ip.cidrInfo(r.network);
            let asn = r.autonomous_system_organization;
            const meta = {
                type: "asn",
                name: asn,
                source: "maxmind_lite"
            };

            const output = stringify([[Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),
                Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),meta]], {delimiter: '|',quote: '|'}); //

            writeStream.write(output);
        }).on("end", function(){
            console.log("done");
            clearInterval(interval);
            resolve('maxmind_lite_asn');
        }).on("error", function(error){
            console.log(error)
            clearInterval(interval);
            reject('maxmind_lite failed: ' + error.message);
        });
        readStream.pipe(csvStream);
    }));
};

module.exports = async (outputFile, download) => {
    if(download===undefined || download==true) download = true;
    try {
        interval = setInterval(()=>console.log("still working on maxmind_lite_asn"),5000);
        if(download) await downloadMaxmind();
        await extract();
        return processRanges(outputFile); // .then(()=>clearInterval(interval))
    } finally {}
}
