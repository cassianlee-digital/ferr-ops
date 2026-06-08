# 多阶段构建：build 阶段带 native 编译工具装 better-sqlite3，运行阶段精简。
FROM node:20-bookworm-slim AS build
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/ ./

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY server/ ./
COPY public /app/public
EXPOSE 3000
CMD ["node", "src/index.js"]
