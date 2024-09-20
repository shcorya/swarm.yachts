FROM node:20.11.1-alpine3.19 AS compiler

RUN apk add git

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN npm run docs:build

FROM node:20.11.1-alpine3.19

COPY --from=compiler /app/.vitepress/dist ./

RUN npm i -g http-server

ENTRYPOINT ["http-server"]
