import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { ISCNSigningClient } from '@likecoin/iscn-js';

export async function createNFTSigningClient(rpcEndpoint: string, mnemonic: string) {
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'like' });
  const [account] = await signer.getAccounts();
  const client = new ISCNSigningClient();
  await client.connectWithSigner(rpcEndpoint, signer);
  return { client, account };
}
