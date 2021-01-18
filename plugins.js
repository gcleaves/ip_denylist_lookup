const path = require('path');
const firehol = require('ip_denylist_plugin_firehol');
const example = require('ip_denylist_plugin_example');
const udger = require('ip_denylist_plugin_udger');
const udgerStale = require('ip_denylist_plugin_udger_stale');
const maxmindLiteCity = require('ip_denylist_plugin_maxmind_lite_city');
const maxmindLiteASN = require('ip_denylist_plugin_maxmind_lite_asn');

const fireholLists = [
    'https://iplists.firehol.org/files/firehol_level1.netset',
    'https://iplists.firehol.org/files/firehol_level2.netset',
    'https://iplists.firehol.org/files/firehol_level3.netset',
    'https://iplists.firehol.org/files/firehol_level4.netset',
    'https://iplists.firehol.org/files/firehol_proxies.netset',
    'https://iplists.firehol.org/files/firehol_webclient.netset',
    'https://iplists.firehol.org/files/firehol_webserver.netset',
    'https://iplists.firehol.org/files/firehol_abusers_1d.netset',
    'https://iplists.firehol.org/files/firehol_abusers_30d.netset',
    'https://iplists.firehol.org/files/firehol_anonymous.netset'
];

module.exports = [
    // {
    //     name: 'example',
    //     load() {
    //         return example(path.join(__dirname,'staging','example.data.txt'))
    //     },
    //     abortOnFail: false
    // },
    {
        name: 'udger',
        load() {
            return udger(path.join(__dirname,'staging','udger.data.txt'))
        },
        abortOnFail: false
    },
    {
        name: 'udgerStale',
        load() {
            return udgerStale(path.join(__dirname,'staging','udger_stale.data.txt'))
        },
        abortOnFail: true
    },
    // {
    //     name: 'maxmindLiteCity',
    //     load() {
    //         return maxmindLiteCity(path.join(__dirname,'staging','maxmind_lite_city.data.txt'))
    //     },
    //     abortOnFail: false
    // },
    // {
    //    name: 'maxmindLiteASN',
    //    load() {
    //        return maxmindLiteASN(path.join(__dirname,'staging','maxmind_lite_asn.data.txt'))
    //     },
    //     abortOnFail: false
    // },
    // {
    //     name: 'firehol',
    //     load() {
    //         return firehol(path.join(__dirname,'staging','firehol.data.txt'), fireholLists)
    //     },
    //     abortOnFail: true
    // }
];
