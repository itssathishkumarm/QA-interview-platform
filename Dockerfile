# Optional: run the whole platform in a container so candidate code never touches your host.
FROM mcr.microsoft.com/playwright:v1.56.1-jammy
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000 4001 4002
ENV INTERVIEWER_PIN=change-me
CMD ["node", "server.js"]
