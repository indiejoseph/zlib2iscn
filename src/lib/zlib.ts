import axios from 'axios';
import * as p from '@clack/prompts';

const USER_AGENT =
  "'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'";
const ZLIB_BASE_URL = 'https://z-library.se';
export interface zLibResponse {
  success: number;
  books: Book[];
  pagination: Pagination;
}

export interface Book {
  id: number;
  readlist_id: number;
  book_id: number;
  description: any;
  deleted: number;
  date: Date;
  book: BookItem;
}

export interface Date {
  date: string;
  timezone_type: number;
  timezone: string;
}

export interface BookItem {
  id: number;
  title: string;
  author: string;
  volume: string;
  year: number;
  edition?: string;
  publisher: string;
  identifier: string;
  language: string;
  extension: string;
  pages: number;
  filesize: number;
  series: string;
  cover?: string;
  terms_hash: string;
  active: number;
  deleted: number;
  filesizeString: string;
  href: string;
  hash: string;
  description?: string;
  kindleAvailable: boolean;
  sendToEmailAvailable: boolean;
  interestScore: string;
  qualityScore: string;
  dl: string;
  preview: string;
  isbn: string;
  ipfs?: string;
  ipfsBlake2b?: string;
  _isUserSavedBook: boolean;
  coverData?: string;
}

export interface Pagination {
  limit: number;
  current: number;
  before: number;
  next: boolean | number;
  total_items: number;
  total_pages: number;
}

export const getBooksFromReadlist = async (url: string) => {
  const readlistIdMatches = url.match(/booklist\/([0-9]+)\/([a-zA-Z0-9]+)\/?/);

  if (!readlistIdMatches || readlistIdMatches.length !== 3) {
    throw new Error('Invalid zLib booklist URL');
  }

  const apiUrl = `${ZLIB_BASE_URL}/papi/booklist/${readlistIdMatches[1]}/get-books`;
  let nextPage: number = 1;
  let books: Book[] = [];

  while (nextPage !== -1) {
    const { data } = await axios.get<zLibResponse>(`${apiUrl}/${nextPage}`, {
      responseType: 'json',
      headers: {
        'User-Agent': USER_AGENT,
        Referer: url,
      },
    });
    const pagingNext = data.pagination.next;

    books = [...books, ...data.books];
    nextPage = Number.isInteger(pagingNext) ? (pagingNext as number) : -1;
  }

  return books;
};

export const getBookIpfsHashes = async (
  books: Book[],
  spinner: ReturnType<typeof p.spinner>
): Promise<
  Array<{
    ipfs: string;
    ipfsBlake2b: string;
  } | null>
> => {
  // get ipfs hash from href
  const bookIpfsHashes = await books.reduce(
    (accPromise, book) => {
      return accPromise.then(async acc => {
        const bookUrl = `${ZLIB_BASE_URL}${book.book.href}`;
        const { data } = await axios.get<string>(bookUrl, {
          responseType: 'text',
          headers: {
            'User-Agent': USER_AGENT,
            Referer: ZLIB_BASE_URL,
          },
        });
        const ipfsMatches = [
          ...data.matchAll(/data-copy="([^"]+)"\s+data-notif="CID copied to clipboard"/g),
        ];

        if (ipfsMatches && ipfsMatches.length !== 2) {
          return acc;
        }

        const ipfs = ipfsMatches[0][1];
        const ipfsBlake2b = ipfsMatches[1][1];

        spinner.message(`Loading book IPFS hashes: ${acc.length + 1} / ${books.length}`);

        return [
          ...acc,
          {
            ipfs,
            ipfsBlake2b,
          },
        ];
      });
    },
    Promise.resolve(
      [] as Array<{
        ipfs: string;
        ipfsBlake2b: string;
      } | null>
    )
  );

  return bookIpfsHashes;
};
