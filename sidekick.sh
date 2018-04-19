#!/usr/bin/env bash
#
# Pseudo code
# 
# sidekick.sh is a gist of basic design for a __generic__ "sidecar" application
# which fulfill the bare necessities of bilateral (2-way) sidechain <-> mainnet
# relationship.
# 
# While this design priorities the general and generic aspects of the design, 
# it should be obvious that much could be done to improve and grow application-specific
# functionalaity.
# 
# There are 2 critical events that need to be managed in order to integrate a sidechain with mainnet.
# 1. Checkpoint Event 'CE': the sidechain needs to notify an application or otherwise initiate logic at arbitrary checkpoint intervals 'Nci'
#
# 		CE[n].block + Nci = CE[n+1].block
#
# 2. CE[n] -> func(success, error) callback: the sidechain needs to receive a notification or otherwise initiate logic given a success OR error value returned from CE[n]().
#   
# 
# ----
# EXAMPLE
# 
# For the purposes of this demo, we also need to establish an example of expected behavior for the hypothetical contract running on mainnet.
# Let's say that the contract is expected to store block hashes from checkpoint blocks on sidenet. When a block hash is added (appended) to the
# list of stored checkpoint block hashes, the contract returns the sha3 hash of concatenated string Hash[n-1]+ Hash[n] = "0xdeadbeef123...".
# 
# ----
# 
# Use:
# 
# geth --chain side js checkpoint.js | ./sidekick.sh
# 

upstream=127.0.0.1:8545
sidestream=127.0.0.1:8545

sidenet_checkpoint_block_hash="" # Current $line or other arbitrary data.

upstream_contract_address=0x0e7c045110b8dbf29765047380898919c5cb56f4
sidenet_contract_address=0xdeadbeef10b8dbf29765047380898919deadbeef

# An example of how contract return codes could be used as one way to easily verify interoperative success.
upstream_contract_code="" # once upstream contract has been updated with the checkpoint transaction, we'll verify the contract's storage and thereby the integrity of the sidechain with it's hashy return value

while read -r line; do
	echo "Sidecar application received notification of checkpoint event. Data: $line"
	sidenet_checkpoint_block_hash="$line" # just for example. obviously could be a lot more sophisticated
	# 1. Send an upstream transaction to store data on mainnet. 
	# 
	EMERALD_GAS_COST=21 \
	txHash=$(emerald transaction send \
		# our sidekick's account
	    0x0e7c045110b8dbf29765047380898919c5cb56f4 \
	    # our mainnet contract address
	    "$upstream_contract_address" \
	    0x1 \
	    --data="$sidenet_checkpoint_block_hash"
	    --gas=0x2100 \
	    --upstream="$upstream" \
	    < echo "secret passphrase")

	# Init variable to handle status of posting checkpoint data to mainnet contract.
	sidekick_exitcode=1

	# Wait for the transaction to be processed, and get the return value.
	rpc_call_attempts=0
	while [ $rpc_call_attempts -lt 10 ]; do
		res=$(curl -X POST --data '{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["'$txHash'"],"id":1}' "$upstream")
		# If Tx has or has not been incuded in a block.
		# Include other validation here, like does the result of eth_call(tx.code) == expected? eg. check that not only was tx included, but data is also properly stored in contract.
		# Again, this is pseudo code.
		if [[ $(echo "$res" | /usr/bin/local/json result.blockHash) =~ "0x0000"* ]]; then
			rpc_call_attempts=$(( rpc_call_attempts + 1 ))
			sleep 10
		else
			sidekick_exitcode=0
			break; # break while loop. we're done here
		fi
	done

	# Init variable to hold success OR error value to post to sidenet about mainnet contract update status.
	sidenet_contract_notification=""
	# Our tx was apparently successfully posted to mainnet. Tell sidechain about the success.
	if [ $sidekick_exitcode -eq 0 ]; then
		echo "Successfully posted Tx to update mainnet storage contract"
		# Get code at mainnet contract
		res=$(curl -X POST --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["'$upstream_contract_address'", "latest"],"id":1}' "$upstream")
		# or whatever, however we want to define logic and responsiblity for the sidechain contract
		sidenet_contract_notification=$(echo "res" | /usr/bin/local/json result)
	
    # Failed to post data to mainnet. This sidechain checkpoint has been compromised. Tell sidechain about failure.
	else
		echo "Failed to post checkpoint data to mainnet."
		sidenet_contract_notification="0xe5505faaaaa11111117777777$sidenet_checkpoint_block_hash"
	fi

	# Send the result to our sidenet contract
	emerald transaction send \
		# our sidekick's account
	    0x0e7c045110b8dbf29765047380898919c5cb56f4 \
	    # our sidekick contract address
	    "$sidenet_contract_address" \
	    0x1 \
	    --data="$sidenet_contract_notification"
	    --gas=0x2100 \
	    --upstream="$sidestream" \
	    < echo "secret passphrase"

done < "${1:-/dev/stdin}" # Read from file name if given as first parameter $1, otherwise from std input.