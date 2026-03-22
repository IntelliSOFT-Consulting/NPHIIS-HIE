FROM node:alpine
WORKDIR /usr/mediators/

COPY package.json ./
COPY prisma ./prisma
RUN npm install typescript yarn -g --force
RUN yarn install
COPY . .
RUN yarn build

EXPOSE 3000
CMD ["node", "./build/index.js"]
