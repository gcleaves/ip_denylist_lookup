# IP DENY LIST LOOKUP
* Download IP lists from [firehol](https://iplists.firehol.org/)
* Process them into unique non-overlapping ranges while maintaining the list name each IP belongs to
* Upload ranges to Redis (Redis is required!)
* Serve HTTP endpoint to query an IP address
* Periodically refresh lists

I wanted to be able to look up an IP address to know how risky it is. Firehol curates a list of suspicious IP addresses. There are two difficulties: a) keeping track of which list the IP address belongs to and b) making the lookup fast. A traditional database is not apt because the need is to search `where $ip is between start_ip_range and end_ip_range` which can't be optimized with an DB index. Some lookups were taking 7s when attempting the above with MySql.

Digging into the Internet suggested that breaking the IP ranges into non-overlapping unique ranges and using a skip list was the way to go. This is what I have attempted to do (using Redis) and lookups now take 5ms, max. I think it works correctly. See bottom of page for more info on how this was accomplished.

## Install
* clone repo
* cd into directory
* `npm install`

## Run standalone script
* set any necessary environment variables, see launch.js
  * redis connection variables
  * http listen port
  * cron schedule
* edit initial list array in launch.js
* `NODE_OPTIONS=--max_old_space_size=4096 node --expose-gc launch.js`

## Run with Docker
* edit docker-compose.yml as needed
* `docker-compose up`

## Usage notes
* Node can use A LOT of memory while loading the IPs into Redis. Memory usage is much lower once loading is complete. On reference machine: 
  * Loading takes 2.7GB, 32s without --collectGarbage option. 
  * Loading takes 1.1GB, 43s with --collectGarbage
  * `NODE_OPTIONS=--max_old_space_size=4096` or similar env variable required.
* wait for download and processing, system is ready when you see `IP ranges app listening at...`
* visit http://localhost:3000/192.168.0.1
* updated lists will be pulled according to given cron schedule
* it is possible to add or remove lists while the system is running by editing the Redis key `ip_lists:lists`. Changes will take place during the next scheduled update.
* add files to ./other_lists folder to add your own IP lists

## Gotchas
* memory limits
  
  * check your Docker VM settings in Windows or Mac, 2GB RAM won't cut it

## Todo
* ability to query multiple IP addresses at once
* ability to define whether HTTP endpoint should return info in plain text or JSON
 
-------------------------------------------
Based on prior work:

user285148: https://softwareengineering.stackexchange.com/questions/363091/split-overlapping-ranges-into-all-unique-ranges

Dvir Volk: https://groups.google.com/g/redis-db/c/lrYbkbxfQiQ
