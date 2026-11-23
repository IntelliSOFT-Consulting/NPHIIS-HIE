FROM node:22-alpine
WORKDIR /usr/mediators/

COPY package.json yarn.lock ./
COPY prisma ./prisma
RUN npm install typescript yarn -g --force
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

EXPOSE 3000
CMD ["node", "./build/index.js"]
