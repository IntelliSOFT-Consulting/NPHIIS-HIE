FROM node:alpine
WORKDIR /usr/mediators/

# Install OpenSSL and other required dependencies for Prisma
RUN apk add --no-cache openssl openssl-dev

COPY package.json .
RUN npm install typescript yarn -g --force
RUN yarn install
COPY . .

RUN yarn prisma generate
RUN yarn build

EXPOSE 3000
CMD ["node", "./build/index.js"]
# CMD ["yarn", "dev"]