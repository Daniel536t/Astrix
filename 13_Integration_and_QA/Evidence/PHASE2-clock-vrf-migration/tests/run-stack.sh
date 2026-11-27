#!/bin/bash
# Fully local MagicBlock stack, every component logging to its own file. 127.0.0.1 only.
source /projects/sandbox/.tools/scratch/phase2/env.sh
cd /projects/sandbox/.tools/scratch/phase2/mb-local
M=node_modules/@magicblock-labs
rm -rf test-ledger magicblock-test-storage logs; mkdir -p logs
node $M/ephemeral-validator/mbTestValidator.js --rpc-port 8899 --reset \
  --upgradeable-program Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy ../backup/program/astrix_settlement.devnet.so 47fUJb27PB6JRjUprmvgFTkRLCE6P8cL7LFsV6nmQrV1 \
  --mint 47fUJb27PB6JRjUprmvgFTkRLCE6P8cL7LFsV6nmQrV1 --account 5kuHeeHLqDTd7tDDvnh58J1KJ77YKfdHV6ZXZ55dReVw cranker-account.json > logs/base.log 2>&1 &
for i in $(seq 1 60); do curl -s -m 2 http://127.0.0.1:8899 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok && break; sleep 1; done
RUST_LOG=info $M/ephemeral-validator-linux-x64/bin/ephemeral-validator --listen 127.0.0.1:7799 --remotes http://127.0.0.1:8899 --remotes ws://127.0.0.1:8900 > logs/er.log 2>&1 &
for i in $(seq 1 60); do curl -s -m 2 http://127.0.0.1:7799 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | grep -q result && break; sleep 1; done
RUST_LOG=info $M/vrf-oracle-linux-x64/bin/vrf-oracle --rpc-url http://127.0.0.1:7799 --websocket-url ws://127.0.0.1:7800 > logs/vrf.log 2>&1 &
RUST_LOG=info $M/hydra-cranker-linux-x64/bin/hydra-cranker --ephemeral --rpc-url http://127.0.0.1:7799 --ws-url ws://127.0.0.1:7800 --base-rpc-url http://127.0.0.1:8899 --keypair cranker.json > logs/cranker.log 2>&1 &
sleep 8
echo "stack up"
