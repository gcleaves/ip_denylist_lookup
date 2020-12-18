// https://udger.com/ - datacenter IP database

'use strict';
const axios = require('axios');
const fs = require('fs');
const config = require('./config.json');
const sqlite3 = require('sqlite3').verbose();
const dbFile = __dirname + '/' + 'udgerdb_v3.dat';

const downloadUdger = async () => {
    console.log("downloading udger");
    const writer = fs.createWriteStream(dbFile);
    const response = await axios({
        method: 'get',
        url: `http://data.udger.com/${config.apiKey}/udgerdb_v3.dat`,
        responseType: 'stream'
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

module.exports = async (outputFile, download) => {
    const interval = setInterval(()=>console.log("still working on udger"),5000);
    try {
        if(download===undefined || download==true) download = true;
        if(download) await downloadUdger();
        console.log('finished downloading udger');
        console.log('extracting datacenter IPs');
        const tempFile = __dirname + '/' + 'rth595hg34G4gsdfgnu7865y';
        const writer = fs.createWriteStream(tempFile);
        const db = new sqlite3.Database(dbFile);
        db.each("SELECT iplong_from `from`, iplong_to `to`, name from udger_datacenter_range r " +
            "inner join udger_datacenter_list l on r.datacenter_id=l.id limit -1", function(err, row) {
            let dcName = row.name.replace(/"/g,'\"');
			dcName = dcName.replace(/,/g,'');
            const csv = row.from + "," + row.to + `,"datacenter|${dcName}"\n`; // -${row.name}
            writer.write(csv);
        }, function() {writer.close()});

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('finished extracting datacenter IPs');
                fs.renameSync(tempFile, outputFile);
                resolve('udger');
            });
            writer.on('error', reject);
        });
    } finally {
        clearInterval(interval);
    }
}
