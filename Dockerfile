FROM node:15-alpine
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN apk add --update gcc g++ make python
WORKDIR /code
RUN npm install sqlite3 --build-from-source
COPY . .
#RUN dos2unix start.sh
RUN npm install
EXPOSE 3000

CMD ["node", "--expose-gc", "launch.js"]
