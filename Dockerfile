FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY plugin ./plugin
COPY tools ./tools

ENV NODE_ENV=production \
    FIGMA_LOCAL_MCP_DIR=/data

RUN mkdir -p /data && chown node:node /data
USER node

ENTRYPOINT ["node", "bin/figma-local-mcp.js"]
