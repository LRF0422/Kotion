FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy server source files
COPY src ./src

# Create certs directory for SSL certificates
RUN mkdir -p ./certs

# Expose the default port
EXPOSE 1234

# Set environment variables
ENV PORT=1234
ENV NODE_ENV=production
ENV SSL_ENABLED=false
ENV SSL_KEY_PATH=/usr/share/nginx/kotion.top.key
ENV SSL_CERT_PATH=/usr/share/nginx/kotion.top.pem

# Start the server
CMD ["node", "./src/server.mjs"]
