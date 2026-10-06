#!/bin/bash
# Start mongod as replica set rs0, then initiate it once with the private-network host name.
set -e
RS_HOST="${RS_HOST:-mongo.railway.internal:27017}"
mkdir -p /data/db
# On redeploy, private DNS still points at the old container; make the member host resolve to this node.
grep -q "${RS_HOST%%:*}" /etc/hosts || echo "127.0.0.1 ${RS_HOST%%:*}" >> /etc/hosts
# Railway free volume is ~434 MB: lower the 500 MB index-build floor and cap diagnostic.data (default 200 MB).
mongod --replSet rs0 --bind_ip_all --ipv6 --port 27017 --dbpath /data/db \
  --setParameter indexBuildMinAvailableDiskSpaceMB=50 \
  --setParameter diagnosticDataCollectionDirectorySizeMB=20 &
PID=$!
until mongosh --quiet --eval 'db.adminCommand({ping:1})' >/dev/null 2>&1; do sleep 1; done
mongosh --quiet --eval "
try { rs.status(); print('rs0 already initiated'); }
catch (e) { rs.initiate({_id:'rs0', members:[{_id:0, host:'${RS_HOST}'}]}); print('rs0 initiated as ${RS_HOST}'); }"
wait $PID
