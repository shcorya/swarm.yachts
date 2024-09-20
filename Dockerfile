FROM node:20-alpine AS compiler

# needed for compilation
RUN apk add git

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN npm run docs:build

# output image
FROM node:20-alpine

COPY --from=compiler /app/.vitepress/dist ./

RUN npm i -g http-server

ENTRYPOINT ["http-server"]
