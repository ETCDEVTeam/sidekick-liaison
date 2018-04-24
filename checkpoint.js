// Redirect stdout (as opposed to geth-usual stderr) output created by geth's JS console logging (just plain `console.log`)
// to an arbitrary file.
//
// RUN:
//
// geth --chain blue --js-path="./std-sidekick" js checkpoint.js
// OR
// geth --chain blue --js-path="./std-sidekick" js checkpoint.js | ./sidekick.sh


var checkpointContract = "0xdeadbeef10b8dbf29765047380898919deadbeef"
var checkpointInterval = 50; // checkpoint every n blocks

// exampleContractValidator is pseudo code to signal using a smart contract on the sidechain
// as a data store and program for blockchain validation.
function exampleContractValidator(blockNumber) {

  // ensure that returned value from contract code call is expected (just for an example of verification logic as a result of sidekick.sh interaction with mainnet)
  // although is overkill and doesn't handle edge cases... but an example
  function checkpointContractOutIsValid(contractReturnValue) {
    var blockNumber_2 = eth.getBlock(blockNumber-(2*checkpointInterval)); // get 2-ago checkpoint block
    var blockNumber_1 = eth.getBlock(blockNumber-checkpointInterval); // get 1-ago checkpoint block
    return web3.sha3(blockNumber_2+blockNumber_1) !== contractReturnValue
  }

  // get the code from the sidechain checkpoint contract.
  // note that we can provide a block number as a parameter for what state of the contract we want.
  // in this implementation, we'll use only the latest code available, however there are probably solutions to this verification challenge
  // that would use comparisons or functions of different states of contract code.
  var checkpointContractCode = eth.getCode(checkpointContract, blockNumber);

  // get the return value from the contract code.
  var contractOut = eth.call({from: "0xanyaddress", to: "0xanyaddress", data: checkpointContractCode}); // "0x...."

  return checkpointContractOutIsValid(contractOut);
}

// validateCheckpoint checks the status of a predetermined contract which stores states returned
// from checkpoints posted to mainnet. when called, the contract returns an externally verifiable value (eg hash of two expected/known block hashes)
// that can be used to confirm a positive or negative outcome from the last checkpoint
function validateCheckpoint(blockNumber) {

  // there are probably many ways to implement this, and I haven't settled on a best solve yet.
  // this function to emphasize swappability and custom/develop-able validation logics based on variable contract logic.
  return exampleContractValidator(blockNumber);
}

function assertCheckpoint(blockNumber) {
  var block = eth.getBlock(blockNum);

  // var json = {"block": blockNum, "hash": block.hash};
  // var jsonstring = JSON.stringify(json);

  // for demo purposes just write block hash to console log, which goes to stdout.
  // this can then be captured by the "sidecar" mainnet-liason application
  console.log(block.hash);
}

// checkpointHandler abstract handling checkpoint event management.
// it accepts functions for checkpoint success and failure callbacks, each which are passed
// the current checkpoint blocknumber.
function checkpointHandler(onSuccess, onFail) {
  var blockNum = eth.blockNumber;
  var distanceFromCheckpoint = blockNum % checkpointInterval;

  // if the chain has arrived at a checkpoint block
  if (blockNum !== 0 && distanceFromCheckpoint === 0) {

      // if contract fails (data from mainnet was invalid), purge blocks between current block (which would have been newest checkpoint) and last checkpoint
      if (!validateCheckpoint(blockNum)) {

        // fire failure callback
        if (onFail !== null) {
          onFail(blockNum);
        }

      // else our contract was updated and valid, verifying that our last checkpoint was successfully recorded on the mainnet
      } else {

          // fire success callback
          if (onSuccess !== null) {
            onSuccess(blockNum);
          }

          // now we can wait the precise amount of blocks until the next scheduled checkpoint
          admin.sleepBlocks(checkpointInterval);
      }
  } else {
      // otherwise the chain head is not at a checkpoint... wait until next checkpoint.
      // this will only be called once immediately after client start up
      admin.sleepBlocks(distanceFromCheckpoint);
  }
  checkpointHandler();
}

checkpointHandler(assertCheckpoint, function onError(blockNumber) {
  debug.setHead(blockNumber - checkpointInterval);
});
