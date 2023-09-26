
FROM node:lts-alpine as node-builder

# install
FROM node-builder as install
WORKDIR /app

COPY package*.json ./

RUN npm ci

# build
FROM  node-builder as build
WORKDIR /app

COPY . .

COPY --from=install /app .

COPY tsconfig*.json ./

RUN npm run build

RUN npm install --omit=dev

# production
FROM node-builder as production
WORKDIR /app

COPY --from=build /app/dist ./dist

COPY --from=build /app/node_modules ./node_modules

CMD [ "node", "dist/main" ]

