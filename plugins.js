const firehol = require('ip_denylist_plugin_firehol');
const example = require('ip_denylist_plugin_example');
const udger = require('ip_denylist_plugin_udger');

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

module.exports = [{
    name: 'example',
    load: example(__dirname + '/staging/example.data.txt'),
    abortOnFail: true
},
{
    name: 'udger',
    load: udger(__dirname + '/staging/udger.data.txt'),
    abortOnFail: false
},
{
    name: 'firehol',
    load: firehol(__dirname + '/staging/firehol.data.txt',fireholLists),
    abortOnFail: true
}];
