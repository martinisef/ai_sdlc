# `sdlc webhook`: @claude in GitLab/Bitbucket comments → pipeline trigger. Built from the published CLI.
#   docker build --build-arg SDLC_VERSION=0.3.0 -t sdlc-webhook packages/webhook
#   docker run -p 8787:8787 -e SDLC_WEBHOOK_SECRET=… -e GITLAB_TRIGGER_TOKEN=… sdlc-webhook
FROM node:22-alpine
ARG SDLC_VERSION=0
RUN npm install -g "@ai-native-sdlc/cli@${SDLC_VERSION}" && npm cache clean --force
USER node
WORKDIR /home/node
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["sdlc", "webhook"]
