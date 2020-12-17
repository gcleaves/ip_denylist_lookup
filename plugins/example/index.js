'use strict';
const fs = require('fs');

module.exports = (outputFile) => {
    console.log("example starts");
    //fs.writeFileSync(outputFile,"1,16777214,example\n");
    return new Promise((resolve, reject) => {
        //setTimeout(reject(new Error("caca")),2000);
        setTimeout(resolve('example'),2000);
    });
}
