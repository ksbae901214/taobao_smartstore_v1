FROM node:18-alpine

# bcrypt 빌드를 위한 네이티브 도구 설치
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || echo "No build script"

EXPOSE 3000

CMD ["npm", "start"]
