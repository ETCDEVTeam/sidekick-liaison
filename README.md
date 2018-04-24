# ETCDEVTeam/sidekick-*

> A collection of scripts and documents outlining requirements and initial adhoc solves for a minimum-viable ETC sidechains implementation.

- [github.com/ETCDEVTeam/sidekick-tx2poa](http://github.com/ETCDEVTeam/sidekick-tx2poa). A PoA mechanism implemented through an emphemeral JS console.

- [github.com/ETCDEVTeam/sidekick-liaison](http://github.com/ETCDEVTeam/sidekick-liaison). A bash script that listens to a sidechain node and facilitates communication with an arbitrary mainnet node. As written, relies on [emerald-cli](https://github.com/ETCDEVTeam/emerald-cli).

- [github.com/ETCDEVTeam/sidekick-checkpointer](http://github.com/ETCDEVTeam/sidekick-checkpointer). A checkpointing mechanism implemented through an ephemerald JS console.


# sidekick-liaison

## Problem

Make sidechain consensus and block progress dependent on interaction with mainnet as a MVP/PoC pattern.

### Priorities

- minimize protocol-level changest to client protocol or source code; this is a priority because changes and features introduced to the client will require a far larger development and implementation cycle than adhoc solutions.
- assume as little as possible about consensus mechanisms; while PoA is likely to be an associated pattern, we shouldn't assume it as an integral piece of the sidechain "integration" problem.
- emphasize event handling as opposed to describing data; each sidenet and/or application will have different needs and should be encouraged to develop their own best-fit solutions.

## Solution 1

Use identical or similar contracts on mainnet and sidenet to store block requiredHashes (for example, though the data can be arbitrary). Allowed writers to the contract are restricted by whitelist (here's where sidenet "authorities" come in to play). Use a small script or application (a "sidecar") to mediate sending transactions between chains at arbitrary intervals and with arbitrary data.

__Events:__
1. Sidenet checkpoint event: send data to mainnet via signed transaction.
2. Transaction callback: The result of this transaction (or combination result of transaction/contract call) is posted by another transaction, this time to a sidenet contract.
3. As a part of the validating the next checkpoint, any/all nodes on the sidenet can reference the contract to ensure the last checkpoint transactions were successful and valid.

__Necessary logic:__
1. Mainnet storage contract to receive sidenet checkpoint data
2. Sidenet storage contract to receive mainnet checkpoint data
3. Emphemeral JS to initiate checkpoint logic for each geth nodes (eg. [ETCDEVTeam/sidekick-checkpointer](https://github.com/ETCDEVTeam/sidekick-checkpointer/blob/master/checkpoint.js)
4. Sidecar script/app to manage arbitrary data output from checkpoint script (eg. [./sidekick.sh](./sidekick.sh))

### Process and examples

[./sidekick.sh](./sidekick.sh) reads from `stdin` as the recipient of a pipe from the geth client.

> Geth's display and debug logs use `stderr` exclusively, while `console.log` from geth's JS Console goes to `stdout`. This allows to use geth's `attach`, `console`, or ephemeral `js` subcommands as dedicated data stream writers.

```
$ geth --chain sidenet js checkpoint.js | ./sidekick.sh
```

Using `stdin` as a type of notification service from geth, `sidekick.sh` upon receiving a notification (arbitrary `stdin` input) attempts to post a transaction based on this input to the mainnet using a pre-configured remote RPC endpoint.

#### Example 1: data passed is block requiredHash
```js
// checkpoint.js
function formatArbitraryData(block) {
    // CSV
    return web3.toHex(block.number) + "," + block.hash.substring(2);

    // JSON raw
//     JSON.stringify({
//             "n": block.number,
//             "hash": block.hash
//         });

    // JSON hex
//     return web3.fromAscii(JSON.stringify({
//             "n": block.number,
//             "hash": block.hash
//         }));
}

if (blockIsCheckpoint(block)) {
    var data = formatArbitraryData(block); // CSV, JSON, whatever
    console.log(data); // eg. 123,0xa28b04690bcb3ca7c2e026f7b7c91b4303e6bcd75e08de1a8c53ed1826870c34
}
```

```shell
# sidekick.sh
while read data; do
    block_number=$(echo $line | cut -d',' -f1)
    block_hash=$(echo $line | cut -d',' -f2)

    echo "Got checkpoint block notification: block_number=$block_number block_hash=0x$block_hash"

    # use remote RPC
    curl -X POST --data '{"jsonrpc":"2.0","method":"eth_sendTransaction","params":[{to: $mainnet_contract_address, from: $sidekick_address, data: "$block_number$block_hash"}],"id":1}' $upstream_RPC

    # or use local geth executable via IPC
    geth --chain mainnet --exec="eth.sendTransaction({to: $mainnet_contract_address, from: $sidekick_address, data: "$block_number$block_hash"});" console

done < "${1:-/dev/stdin}" # Read from file name if given as first parameter $1, otherwise from std input.
```

#### Example 2: data passed is a signed transaction from a sidenet node (to be executed on mainnet)
```js
// checkpoint.js
var mainnetContractAddress = "0xd67a8aae0d2602a454c6be1324fea4c782f60f3f";
if (blockIsCheckpoint(block)) {
    var data = formatArbitraryData(block);
    var signedTx = eth.signTransaction({to: mainnetContractAddress, from: eth.accounts[0], data: data});
    console.log(signedTx); // eg. 0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421
}
```

```shell
# sidekick.sh
while read data; do
    echo "Got checkpoint signed transaction: $data" # 0xd46e8dd67c5d32be8d46e8dd67c5d32be8058bb8eb970870f072445675058bb8eb970870f072445675

    # use remote RPC
    curl -X POST --data '{"jsonrpc":"2.0","method":"eth_sendRawTransaction","params":[{
  "data": "$data"}],"id":1}' $upstream_RPC

    # or use local geth executable via IPC
    geth --chain mainnet --exec="eth.sendRawTransaction($data);" console

done < "${1:-/dev/stdin}" # Read from file name if given as first parameter $1, otherwise from std input.
```
