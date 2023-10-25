import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { createNFTSigningClient } from './iscn';

describe('createNFTSigningClient', () => {
  it('should create a signing client and return the client and account', async () => {
    const testMnemonic = await DirectSecp256k1HdWallet.generate(12, { prefix: 'like' });

    const { client, account } = await createNFTSigningClient(
      'https://node.testnet.like.co/rpc/',
      testMnemonic.mnemonic
    );

    expect(client).toBeDefined();
    expect(account).toBeDefined();
  });
});
