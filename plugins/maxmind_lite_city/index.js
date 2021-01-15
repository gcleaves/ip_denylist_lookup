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
const zipFile = path.join(__dirname,'maxmind_city.zip');
let interval;

const ip2int = (ip) => {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

const downloadMaxmind = async () => {
    console.log("downloading maxmind_lite_city");
    const writer = fs.createWriteStream(zipFile);
    const response = await axios({
        method: 'get',
        url: `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City-CSV&license_key=${config.apiKey}&suffix=zip`,
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
                if (/GeoLite2-City-Locations-en|GeoLite2-City-Blocks-IPv4/.test(fileName)) {
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

const loadCities = async () => {
    console.log('loading english city names');
    const filename = path.join(__dirname,'GeoLite2-City-Locations-en.csv');
    const data = {};

    return new Promise((resolve, reject) => {
        fs.createReadStream(filename)
            .pipe(parse())
            .on('data', (r) => {
                data[r.geoname_id] = r;
            })
            .on('end', () => {
                console.log(data[597729]);
                resolve(data);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

const processRanges = async (cities, outputFile) => {
    console.log('processing city ranges');
    const fileName = path.join(__dirname,'GeoLite2-City-Blocks-IPv4.csv');
    const readStream = fs.createReadStream(fileName); // readStream is a read-only stream wit raw text content of the CSV file
    const writeStream = fs.createWriteStream(outputFile); // writeStream is a write-only stream to write on the disk
    const csvStream = csv.parse({ delimiter: ',', columns: true }); // csv Stream is a read and write stream : it reads raw text in CSV and output untransformed records

    return new Promise(((resolve, reject) => {
        csvStream.on("data", function(r) {
            const cidrInfo = ip.cidrInfo(r.network);
            let country = '', city = '', region = '';
            if(cities[r.geoname_id]) {
                country = cities[r.geoname_id].country_iso_code;
                city = cities[r.geoname_id].city_name;
                region = cities[r.geoname_id].subdivision_1_name;
            }
            const meta = {
                type: "geo",
                country: country,
                city: city,
                region: region,
                source: "maxmind_lite"
            };

            const output = stringify([[Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),
                Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),meta]], {delimiter: '|',quote: '|'}); //
            if(city || country) {
                writeStream.write(output);
            }
        }).on("end", function(){
            console.log("done");
            clearInterval(interval);
            resolve('maxmind_lite_city');
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
        interval = setInterval(()=>console.log("still working on maxmind_lite_city"),5000);
        if(download) await downloadMaxmind();
        await extract();
        const cities = await loadCities();
        return processRanges(cities,outputFile); // .then(()=>clearInterval(interval))
    } finally {}
}
