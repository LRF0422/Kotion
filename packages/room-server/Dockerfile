FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy server source files
COPY src ./src

# Expose the default port
EXPOSE 1234

# Set environment variables
ENV PORT=1234
ENV NODE_ENV=production

# Start the server
CMD ["node", "./src/server.mjs"]
