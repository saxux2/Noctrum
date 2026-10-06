# Single-node MongoDB replica set for Railway (T5.6).
# vault-api ledger writes use transactions, so Mongo must be a replica set (ENV_AND_CONFIG §2).
# Reachable only on Railway's private network (mongo.railway.internal); no public TCP proxy.
FROM mongo:8.0
COPY entrypoint.sh /usr/local/bin/noctrum-mongo.sh
RUN chmod +x /usr/local/bin/noctrum-mongo.sh
EXPOSE 27017
CMD ["/usr/local/bin/noctrum-mongo.sh"]
