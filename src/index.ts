import {
  note,
  spinner,
  password,
  text,
  outro,
  group,
  select,
  confirm,
  isCancel,
  cancel,
} from '@clack/prompts';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Book, getBookIpfsHashes, getBooksFromReadlist } from './lib/zlib.js';
import { createNFTSigningClient, estimateISCNFee, getAccountBalance } from './lib/iscn.js';
import BigNumber from 'bignumber.js';
import packageJson from '../package.json' assert { type: 'json' };
import { ISCNSignPayload, Stakeholder } from '@likecoin/iscn-js';

const COSMOS_DENOM = 'nanolike';
const TESTNET_COSMOS_DENOM = 'nanoekil';
const GAS_PRICE = 10;
const ISCN_RECORD_NOTES = `zlib-iscn-uploader ${packageJson.version}`;

const s = spinner();

async function main() {
  const tmpDir = os.tmpdir();
  const formattedDate = new Date().toISOString().split('T')[0].replace(/:/g, '-');
  const tmpLogPath = `${tmpDir}/zlib-iscn-uploader-${formattedDate}.log`;
  const logStream = await fs.open(tmpLogPath, 'a');

  console.clear();

  const zlibUrl = await text({
    message: 'Enter the zLib booklist URL',
    placeholder: 'https://z-library.se/booklist/xxxx/xxxx',
    validate: value => {
      if (!value.includes('z-library.se/booklist/')) {
        return 'Please enter a valid zLib booklist URL';
      }
    },
  });

  if (isCancel(zlibUrl)) {
    cancel('Bye!');

    process.exit(0);
  }

  s.start('Fetching books from zLib...');

  let books: Book[] = [];
  let bookIpfsHashes: Awaited<ReturnType<typeof getBookIpfsHashes>> = [];

  try {
    books = await getBooksFromReadlist(zlibUrl.toString());
    bookIpfsHashes = await getBookIpfsHashes(books, s);

    s.stop('Fetched books from zLib, total: ' + books.length);
  } catch (error) {
    console.error(error);
    s.stop('Failed to fetch books from zLib');
  }

  if (books.length === 0) {
    note('No books found, please check your URL and try again.', 'Error');

    outro('Bye!');

    process.exit(0);
  }

  if (bookIpfsHashes.length === 0 || bookIpfsHashes.length !== books.length) {
    note('Failed to get IPFS hashes for all books, please check your URL and try again.', 'Error');

    outro('Bye!');

    process.exit(0);
  }

  const booksWithIpfsHashes = books.map((book, index) => ({
    ...book,
    book: {
      ...book.book,
      ...bookIpfsHashes[index],
    },
  }));
  const convertedData = booksWithIpfsHashes.map(
    ({ book: { title, description, author, id, hash, ipfs } }) => {
      const zlibUrl = `https://z-library.se/book/${id}/${hash}`;
      const contentFingerprints = [`ipfs://${ipfs}`];
      const stakeholders = [
        {
          entity: {
            '@id': author,
            name: author,
          },
          rewardProportion: 1,
          contributionType: 'http://schema.org/author',
        },
      ] as Stakeholder[]; // some authors are comma separated, but the author field is a free text field, so there would have many exceptional cases

      return {
        type: 'Book',
        name: title,
        url: zlibUrl,
        contentFingerprints,
        stakeholders,
        description,
        author,
        recordNotes: ISCN_RECORD_NOTES,
        sameAs: [`ipfs://${ipfs}`],
      } as ISCNSignPayload;
    }
  );

  const iscnUploadGroup = await group(
    {
      rpcUrl: () =>
        select({
          message: 'Select a RPC URL',
          initialValue: 'https://likecoin-public-testnet-5',
          options: [
            {
              title: 'Testnet(likecoin-public-testnet-5)',
              value: 'https://node.testnet.like.co/rpc/',
            },
            {
              title: 'Mainnet',
              value: 'https://mainnet-node.like.co/rpc/',
            },
          ],
        }),
      mnemonic: () =>
        password({
          message: 'Enter your mnemonic',
        }),
      confirm: () =>
        confirm({
          message: 'Confirm to upload?',
        }),
    },
    {
      onCancel: () => {
        cancel('Bye!');

        process.exit(0);
      },
    }
  );

  if (iscnUploadGroup.confirm === false) {
    outro('Bye!');

    process.exit(0);
  }

  try {
    const client = await createNFTSigningClient(iscnUploadGroup.rpcUrl, iscnUploadGroup.mnemonic);
    const iscnFee = await estimateISCNFee(convertedData, GAS_PRICE, client);
    const denom = iscnUploadGroup.rpcUrl.includes('testnet') ? TESTNET_COSMOS_DENOM : COSMOS_DENOM;
    const { amount } = await getAccountBalance(denom, client);
    const balance = new BigNumber(amount).shiftedBy(-9);

    note(balance.toFixed() + ' LIKE', 'Account Balance');
    note(iscnFee + ' LIKE', 'Estimated Gas Fee');

    if (balance.lt(1) || balance.lt(iscnFee)) {
      note(
        'Insufficient account balance, please make sure you have enough LIKE tokens in your account.',
        'Error'
      );

      outro('Bye!');

      process.exit(0);
    }

    const chainId = await client.stargateClient.getChainId();

    s.start('Creating ISCN...');

    for (let i = 0; i < convertedData.length; i++) {
      const payload = convertedData[i];
      const { accountNumber, sequence } = await client.stargateClient.getSequence(client.address);
      const tx = await client.client.createISCNRecord(client.address, payload, {
        accountNumber,
        sequence,
        chainId,
        gasPrice: GAS_PRICE,
        memo: ISCN_RECORD_NOTES,
      });

      // write to log
      await logStream.write(
        `${JSON.stringify({
          ...payload,
          txHash: (tx as any).transactionHash,
          date: new Date().toISOString(),
        })}\n`
      );

      note(
        `ISCN ${i + 1}/${convertedData.length} created, tx hash: ${(tx as any).transactionHash}`,
        'Created ISCN'
      );

      s.message(`Created ISCN: ${i + 1}/${convertedData.length}`);
    }

    s.stop('Created ISCN');

    // stop log stream
    await logStream.close();

    outro(
      `Your ISCNs have been created, please check the log file for transaction details. (${tmpLogPath})`
    );
  } catch (error) {
    console.error(error);
    s.stop('Failed to upload books to ISCN');
  }
}

main();
