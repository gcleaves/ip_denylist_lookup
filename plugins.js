const path = require('path');
const firehol = require('ip_denylist_plugin_firehol');
const example = require('ip_denylist_plugin_example');
const udger = require('ip_denylist_plugin_udger');
const maxmindLite = require('ip_denylist_plugin_maxmind_lite');

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
    {
        name: 'example',
        load() {
            return example(path.join(__dirname,'staging','example.data.txt'))
        },
        abortOnFail: false
    },
    {
        name: 'udger',
        load() {
            return udger(path.join(__dirname,'staging','udger.data.txt'))
        },
        abortOnFail: false
    },
    {
        name: 'maxmindLite',
        load() {
            return maxmindLite(path.join(__dirname,'staging','maxmind_lite.data.txt'))
        },
        abortOnFail: false
    },
    {
        name: 'firehol',
        load() {
            return firehol(path.join(__dirname,'staging','firehol.data.txt'), fireholLists)
        },
        abortOnFail: true
    }
];
