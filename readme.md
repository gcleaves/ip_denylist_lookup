# IP DENY LIST LOOKUP
* Download IP lists from [firehol](https://iplists.firehol.org/)
* Add any additional IP lists stored locally
* Process them into unique non-overlapping ranges while maintaining the list name each IP belongs to
* Upload ranges to Redis (Redis is required!)
* Serve HTTP endpoint to query an IP address
* Periodically refresh lists

I wanted to be able to look up an IP address to know how risky it is. Firehol curates a list of suspicious IP addresses. There are two difficulties: a) keeping track of which list the IP address belongs to and b) making the lookup fast. A traditional database is not apt because the need is to search `where $ip is between start_ip_range and end_ip_range` which can't be optimized with an DB index. Some lookups were taking 7s when attempting the above with MySql. Sqlite is faster but still 100s of ms.

Digging into the Internet suggested that breaking the IP ranges into non-overlapping unique ranges and using a skip list was the way to go. This is what I have attempted to do (using Redis) and lookups now take 3ms, max. I think it works correctly. See bottom of page for more info on how this was accomplished.

## Install
* clone repo
* cd into directory
* `npm install`

## Run standalone script
* set any necessary environment variables (optional), see launch.js
  * redis connection variables
  * http listen port
  * cron schedule
  * HTTP endpoint prefix
* edit initial list array in launch.js
* place any additional lists into the ./other_lists folder.
* `NODE_OPTIONS=--max_old_space_size=4096 node --expose-gc launch.js`

## Run with Docker
* edit docker-compose.yml as needed
* `docker-compose up`

## Usage notes
* Node can use a lot of memory while loading the IPs into Redis. Memory usage is lower once loading is complete. On reference machine: 
  * Loading takes 2.7GB, 32s without --collectGarbage option. 
  * Loading takes 1.1GB, 43s with --collectGarbage
  * `NODE_OPTIONS=--max_old_space_size=4096` or similar env variable required.
* The data in Redis takes about 420M once loaded.
* The node script uses about 1GB of memory at rest.
* wait for download and processing, system is ready when you see `ready to serve!`
* visit http://localhost:3000/192.168.0.1
* updated lists will be pulled according to given cron schedule
* create your own "plugins" to add more IP lists
  * see plugins folder and `plugins.js` for examples
  * a plugin must add a file to the staging folder
  * plugin must return a promise which resolves when the plugin is done writing to the staging folder
  * if the plugin has dependencies you'll want to create a package.json file as well as reference the plugin in the project's main package.json file so that the dependencies are included in the main `npm install`.

## Gotchas
* memory limits
  
  * check your Docker VM settings in Windows or Mac, 2GB RAM won't cut it

## Todo

-------------------------------------------
Based on prior work:

user285148: https://softwareengineering.stackexchange.com/questions/363091/split-overlapping-ranges-into-all-unique-ranges

Dvir Volk: https://groups.google.com/g/redis-db/c/lrYbkbxfQiQ
