# ---- build stage: compile the React app into dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: serve dist/ + the /api JSON API ----
# server.mjs only needs Node builtins + src/data.js, so no node_modules at runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

# package.json provides the "type": "module" field that src/data.js needs as ESM
COPY package.json ./
COPY server.mjs ./
COPY src/data.js ./src/data.js
COPY --from=build /app/dist ./dist

RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/state').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]