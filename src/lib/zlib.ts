import axios from 'axios';

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
  const readlistId = url.split('/').splice(-2, 1)[0];
  const apiUrl = `https://zlibrary-africa.se/papi/booklist/${readlistId}/get-books`;
  let nextPage: number = 1;
  let books: Book[] = [];

  while (nextPage !== -1) {
    const { data } = await axios.get<zLibResponse>(`${apiUrl}/${nextPage}`, {
      responseType: 'json',
    });
    const pagingNext = data.pagination.next;

    books = [...books, ...data.books];
    nextPage = Number.isInteger(pagingNext) ? (pagingNext as number) : -1;
  }

  return books;
};
