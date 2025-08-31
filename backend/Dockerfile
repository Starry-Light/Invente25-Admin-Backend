FROM node:20-alpine

# Add curl for healthchecks
RUN apk --no-cache add curl

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --production

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/index.js"]
