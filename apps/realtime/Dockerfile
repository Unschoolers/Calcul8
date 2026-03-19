FROM node:20-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
