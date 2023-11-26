import { AccountData, DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import BigNumber from 'bignumber.js';
import {
  ISCNQueryClient,
  ISCNSignOptions,
  ISCNSignPayload,
  ISCNSigningClient,
} from '@likecoin/iscn-js';
import { DeliverTxResponse, SigningStargateClient } from '@cosmjs/stargate';

// export interface ISCNTxPayload extends Record<string, any> {
//   name: string;
//   description: string;
//   type: string; // https://schema.org/CreativeWork#subtypes
//   author: string;
//   usageInfo: string;
//   license: string;
//   ipfsHash: string;
//   arweaveId: string;
//   fileSHA256: string;
//   recordNotes: string;
//   sameAs: string;
// }

export interface SigningClient {
  client: ISCNSigningClient;
  stargateClient: SigningStargateClient;
  queryClient: ISCNQueryClient;
  account: AccountData;
  address: string;
}

export async function createNFTSigningClient(
  rpcEndpoint: string,
  mnemonic: string
): Promise<SigningClient> {
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'like' });
  const [account] = await signer.getAccounts();
  const address = account.address;
  const client = new ISCNSigningClient();

  await client.connectWithSigner(rpcEndpoint, signer);

  // get stargate client
  const signingStargateClient = client.getSigningStargateClient();

  // get query client
  const queryClient = new ISCNQueryClient();

  await queryClient.connect(rpcEndpoint);

  if (!signingStargateClient) {
    throw new Error('SigningStargateClient not found');
  }

  return {
    client,
    account,
    address,
    queryClient,
    stargateClient: signingStargateClient,
  } as SigningClient;
}

export async function getSequence({ stargateClient, address }: SigningClient) {
  const { sequence } = await stargateClient.getSequence(address);
  return sequence;
}

export async function getAccountBalance(
  searchDenom: string,
  { stargateClient, address }: SigningClient
) {
  const balance = await stargateClient.getBalance(address, searchDenom);

  return balance;
}

export async function signISCN(
  payload: ISCNSignPayload,
  iscnIdForUpdate: string,
  signOptions: ISCNSignOptions,
  { queryClient, address, client }: SigningClient
) {
  let res: Awaited<ReturnType<typeof client.createISCNRecord>>;

  if (iscnIdForUpdate) {
    res = await client.updateISCNRecord(address, iscnIdForUpdate, payload, signOptions);
  } else {
    res = await client.createISCNRecord(address, payload, signOptions);
  }

  const { transactionHash: txHash } = res as DeliverTxResponse;
  const [iscnId] = await queryClient.queryISCNIdsByTx(txHash);

  return { txHash, iscnId };
}

export async function estimateISCNFee(
  data: ISCNSignPayload[],
  gasPrice: number,
  { client }: SigningClient
) {
  const chunkSize = 100000;
  let totalGasFee = new BigNumber(0);
  let totalISCNFee = new BigNumber(0);

  try {
    for (let chunkStart = 0; chunkStart < data.length; chunkStart += chunkSize) {
      const promises = data
        .slice(chunkStart, chunkStart + chunkSize)
        .map(payload => client.esimateISCNTxGasAndFee(payload, { gasPrice }));
      /* eslint-disable no-await-in-loop */
      const fees = await Promise.all(promises);
      /* eslint-enable no-await-in-loop */
      totalGasFee = fees.reduce((sum, { gas }) => sum.plus(gas.fee.amount[0].amount), totalGasFee);
      totalISCNFee = fees.reduce((sum, { iscnFee }) => sum.plus(iscnFee.amount), totalISCNFee);
    }
    return totalGasFee.plus(totalISCNFee).shiftedBy(-9).toFixed();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to estimate fee');
    throw err;
  }
}
