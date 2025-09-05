FROM node:20-slim

WORKDIR /app

# Install OpenSSL and other dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 8000

CMD ["npm", "start"]
