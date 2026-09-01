# ---- runtime stage: the zero-dependency Node API ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000

# package.json provides "type": "module" for any .js ESM; the API itself is
# all .mjs and needs no node_modules at runtime.
COPY package.json ./
COPY api ./api

RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/state').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "api/server.mjs"]
