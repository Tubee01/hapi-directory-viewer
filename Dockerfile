
FROM node:lts-alpine as node-builder

RUN npm i -g pnpm

# install
FROM node-builder as install
WORKDIR /app

COPY package*.json ./

COPY pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# build
FROM  node-builder as build
WORKDIR /app

COPY . .

COPY --from=install /app .

COPY tsconfig*.json ./

RUN pnpm run build

RUN pnpm install --production --frozen-lockfile

# production
FROM node-builder as production
WORKDIR /app

COPY --from=build /app/dist ./dist

COPY --from=build /app/node_modules ./node_modules

CMD [ "node", "dist/main" ]

