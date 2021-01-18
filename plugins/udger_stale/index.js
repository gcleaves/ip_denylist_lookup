// https://udger.com/ - datacenter IP database

'use strict';
const axios = require('axios');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const ip = require('ip-utils');
const dbFile = __dirname + '/' + 'udgerdb_v3.dat';
const pluginName = 'udger_stale';

module.exports = async (outputFile) => {
    const interval = setInterval(()=>console.log("still working on " + pluginName),5000);
    try {

        console.log('extracting datacenter IPs');
        const tempFile = __dirname + '/' + 'rth595hg34G4gsdfgnu7865y';
        const writer = fs.createWriteStream(tempFile);
        let db;

        await Promise.all([
            new Promise((resolve, reject) =>  {
                db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (error) => {
                    if(error) reject(pluginName + ' failed: ' + error.message)
                    resolve();
                });
            }),
            new Promise((resolve, reject) => {
                db.each("SELECT iplong_from `from`, iplong_to `to`, name from udger_datacenter_range r " +
                    "inner join udger_datacenter_list l on r.datacenter_id=l.id limit -1", function (err, row) {
                    const meta = {
                        type: "list",
                        source: "udger",
                        name: "datacenter",
                        meta: {
                            "datacenter_name": row.name
                        }
                    };
                    const metadata = JSON.stringify(meta);

                    //let dcName = row.name.replace(/"/g, '\"');
                    //dcName = dcName.replace(/,/g, '');
                    const csv = row.from + "|" + row.to + "|" + metadata + "\n"; // -${row.name}
                    writer.write(csv);
                }, resolve);
            }),
            new Promise((resolve, reject) => {
                db.each("SELECT l.ip, c.ip_classification_code code, l.ip_country_code country, l.ip_city city from udger_ip_list l " +
                    "inner join udger_ip_class c on l.class_id=c.id limit -1", function (err, row) {
                    const meta = {
                        type: "geo",
                        country: row.country,
                        city: row.city,
                        source: "udger"
                    };
                    let metadata = JSON.stringify(meta);
                    let csv = `${ip.toLong(row.ip)}|${ip.toLong(row.ip)}|` + metadata + "\n";
                    writer.write(csv);

                    delete meta.country;
                    delete meta.city;
                    delete meta.region;
                    meta.type = "list";
                    meta.source = "udger";
                    meta.name = row.code;
                    metadata = JSON.stringify(meta);
                    csv = `${ip.toLong(row.ip)}|${ip.toLong(row.ip)}|` + metadata + "\n";
                    writer.write(csv);
                }, resolve);
            })
        ]);
        writer.close();

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log('finished extracting datacenter IPs');
                fs.renameSync(tempFile, outputFile);
                clearInterval(interval);
                resolve(pluginName);
            });
            writer.on('error', () => {
                clearInterval(interval);
                console.error(pluginName + ' error.');
                reject(pluginName + " failed");
            });
        });
    } finally {}
}
