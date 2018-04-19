// Redirect stdout (as opposed to geth-usual stderr) output created by geth's JS console logging (just plain `console.log`)
// to an arbitrary file.
// 
// RUN: 
// 
// geth --chain blue --js-path="./std-sidekick" js checkpoint.js
// OR
// geth --chain blue --js-path="./std-sidekick" js checkpoint.js | ./sidekick.sh

var checkpointContract = "0xdeadbeef10b8dbf29765047380898919deadbeef"
var checkpointInterval = 50;
var checkpoint = function(n) {
    var bn = eth.blockNumber;
    var mod = bn % checkpointInterval;
    if (mod === 0) {
        var code = eth.getCode(checkpointContract, bn);
        var contractOut = eth.call({from: "0xanyaddress", to: "0xanyaddress", data: code}); // "0x...."
        
        // ensure that expected hash is == contractOut (just for an example of verification logic as a result of sidekick.sh interaction with mainnet)
        // although is overkill and doesn't handle edge cases... but an example
        var bn_2 = eth.getBlock(bn-(2*checkpointInterval)); // get 2-ago checkpoint block
        var bn_1 = eth.getBlock(bn-checkpointInterval); // get 1-ago checkpoint block
        // 
        // if contract fails (data from mainnet was invalid), purge blocks between current block (which would have been newest checkpoint) and last checkpoint
        if (web3.sha3(bn_2+bn_1) !== contractOut) {
            debug.setHead(bn_1);
            // else our contract was updated and valid, verifying that our last checkpoint was successfully recorded on the mainnet
        } else {
            var block = eth.getBlock(bn);

            // var json = {"block": bn, "hash": block.hash};
            // var jsonstring = JSON.stringify(json);
            
            console.log(block.hash);

            admin.sleepBlocks(checkpointInterval);            
        }
    } else {
        admin.sleepBlocks(mod);
    }
    checkpoint();
}
checkpoint();
