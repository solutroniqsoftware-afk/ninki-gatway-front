FROM node:22-slim
WORKDIR /app

# Wrangler embarque Workerd pour executer le Worker CF en local
RUN npm install -g wrangler@latest

# Copier uniquement le build SSR pre-compile
COPY dist/ ./dist/

WORKDIR /app/dist/server

EXPOSE 4173

CMD ["wrangler", "dev", "--local", "--port", "4173", "--ip", "0.0.0.0", "--no-bundle", "index.js"]
