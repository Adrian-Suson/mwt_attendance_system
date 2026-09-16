let client = null;

function setClient(c) {
  client = c;
}

function getClient() {
  if (!client) {
    throw new Error("Database client is not initialized yet");
  }
  return client;
}

module.exports = { setClient, getClient };
