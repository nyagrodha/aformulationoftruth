FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5742

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 5742

CMD ["serve", "-s", "build", "-l", "5742"]
