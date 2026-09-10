FROM mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48
WORKDIR /opt/browser
RUN npm install --ignore-scripts --no-audit --no-fund playwright@1.61.1
ENTRYPOINT ["node", "/app/tests/btop-browser/run.mjs"]
