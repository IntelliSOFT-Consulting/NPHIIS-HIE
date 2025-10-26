FROM node:20-alpine
WORKDIR /usr/mediators/

# Install OpenSSL and build dependencies for Prisma and native modules (bcrypt)
RUN apk add --no-cache \
    openssl \
    openssl-dev \
    python3 \
    make \
    g++

# Install global dependencies
RUN npm install typescript yarn -g --force

# Copy package files
COPY package.json yarn.lock* ./

# Copy Prisma schema first (needed for proper installation)
COPY prisma ./prisma

# Install dependencies
RUN yarn install

# Generate Prisma client for the correct platform
RUN yarn prisma generate

# Copy the rest of the source code
COPY . .

# Build the application
RUN yarn build

EXPOSE 3000
CMD ["node", "./build/index.js"]