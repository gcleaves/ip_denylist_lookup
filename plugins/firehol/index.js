'use strict';

const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const ip = require('ip-utils');
const path = require('path');
const util = require('util');
const BasePlugin = require('../base');

/**
 * Convert IP address to integer
 * @param {string} ip - IP address string
 * @returns {number} IP as integer
 */
function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

/**
 * Default Firehol list URLs
 */
const DEFAULT_FIREHOL_LISTS = [
    'https://iplists.firehol.org/files/firehol_level1.netset',
    'https://iplists.firehol.org/files/firehol_level2.netset',
    'https://iplists.firehol.org/files/firehol_level3.netset',
    'https://iplists.firehol.org/files/firehol_level4.netset',
    //'https://iplists.firehol.org/files/firehol_proxies.netset', // included in anonymous.netset
    'https://iplists.firehol.org/files/firehol_webclient.netset',
    'https://iplists.firehol.org/files/firehol_webserver.netset',
    'https://iplists.firehol.org/files/firehol_abusers_1d.netset',
    'https://iplists.firehol.org/files/firehol_abusers_30d.netset',
    'https://iplists.firehol.org/files/firehol_anonymous.netset'
];

/**
 * Firehol IP list plugin
 * Downloads and processes IP lists from Firehol
 */
class FireholPlugin extends BasePlugin {
    /**
     * @param {Object} options - Plugin options
     * @param {string} options.outputFile - Output file path
     * @param {string[]} [options.listArray] - Array of Firehol list URLs (defaults to DEFAULT_FIREHOL_LISTS)
     */
    constructor(options = {}) {
        super({
            name: 'firehol',
            version: '1.0.0',
            description: 'Downloads and processes IP lists from Firehol',
            abortOnFail: options.abortOnFail !== false
        });
        this.outputFile = options.outputFile;
        this.listArray = options.listArray || DEFAULT_FIREHOL_LISTS;
        this._interval = null;
    }

    /**
     * Download a single file from Firehol
     * @param {string} fileUrl - URL to download
     * @param {fs.WriteStream} writer - Write stream for output
     * @param {string} tag - Tag name for the list
     * @returns {Promise<boolean>}
     */
    async downloadFile(fileUrl, writer, tag) {
        this.logger.info({ url: fileUrl, tag }, 'Starting download');
        const meta = {
            type: "list",
            name: tag,
            source: "firehol"
        };
        const metadata = JSON.stringify(meta);

        return this.retryWithBackoff(async () => {
            const response = await axios({
                method: 'get',
                url: fileUrl,
                responseType: 'stream',
                timeout: 30000
            });

            return new Promise((resolve, reject) => {
                let error = null;
                readline.createInterface({
                    input: response.data
                }).on('line', data => {
                    let line;
                    if(data[0]==='#') return;
                    const format = `%s|%s|%s\n`;
                    if(data.includes('/')) {
                        const cidrInfo = ip.cidrInfo(data);
                        line = util.format(format, 
                            Math.min(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)),
                            Math.max(ip2int(cidrInfo.firstHostAddress),ip2int(cidrInfo.lastHostAddress)), 
                            metadata);
                    } else {
                        line = util.format(format, ip2int(data), ip2int(data), metadata);
                    }
                    writer.write(line);
                }).on('error',(e) => {
                    error = e;
                    writer.close();
                    reject(new Error(`firehol failure: ${e.message}`));
                }).on('close',()=> {
                    if (!error) {
                        this.logger.info({ url: fileUrl, tag }, 'Finished download');
                        resolve(true);
                    }
                });
            });
        });
    }

    /**
     * Load plugin data
     * @returns {Promise<string>} Plugin name
     */
    async load() {
        if (!this.outputFile) {
            throw new Error('outputFile is required');
        }
        if (!this.listArray || this.listArray.length === 0) {
            throw new Error('listArray is required');
        }

        this._interval = setInterval(() => {
            this.logger.debug('Still working on firehol');
        }, 5000);

        try {
            fs.unlinkSync(this.outputFile);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                this.logger.warn({ error: err.message }, "Can't delete output file");
            }
        }

        return new Promise(async (resolve, reject) => {
            const writer = fs.createWriteStream(this.outputFile, {flags:'a'});
            
            writer.on('close', () => {
                this.logger.info('Firehol writer closed');
                if (this._interval) {
                    clearInterval(this._interval);
                    this._interval = null;
                }
                resolve("firehol");
            });
            
            writer.on('error', (err) => {
                if (this._interval) {
                    clearInterval(this._interval);
                    this._interval = null;
                }
                this.logger.error({ error: err.message }, 'Firehol writer error');
                reject(new Error("firehol failed"));
            });

            try {
                await Promise.all(
                    this.listArray.map(f => 
                        this.downloadFile(f, writer, path.posix.basename(f).replace(/\.(?:ip|net)set/,""))
                    )
                );
                writer.close();
            } catch (e) {
                writer.close();
                reject(new Error(`firehol failure: ${e.message}`));
            }
        });
    }

    /**
     * Validate loaded data
     * @param {any} data - Data to validate
     * @returns {Promise<boolean>}
     */
    async validate(data) {
        if (!fs.existsSync(this.outputFile)) {
            this.logger.error('Output file does not exist');
            return false;
        }
        const stats = fs.statSync(this.outputFile);
        if (stats.size === 0) {
            this.logger.warn('Output file is empty');
            return false;
        }
        return true;
    }

    /**
     * Cleanup plugin resources
     * @returns {Promise<void>}
     */
    async cleanup() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        await super.cleanup();
    }
}

// Export both class and legacy function for backward compatibility
module.exports = FireholPlugin;

// Legacy export for backward compatibility
module.exports.legacy = async (outputFile, listArray) => {
    const plugin = new FireholPlugin({ outputFile, listArray });
    await plugin.init();
    const result = await plugin.load();
    await plugin.validate(result);
    return result;
};

