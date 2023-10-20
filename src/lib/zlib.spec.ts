import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { getBooksFromReadlist } from './zlib';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('zlib', () => {
  const mockPages = [
    fs.readFileSync(path.join(__dirname, '../../tests/fixtures/1.json'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../../tests/fixtures/2.json'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../../tests/fixtures/3.json'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../../tests/fixtures/4.json'), 'utf8'),
  ];
  // mock axios
  mockedAxios.get.mockImplementation((url: string) => {
    const page = Number(url.split('/').pop());
    return Promise.resolve({ data: JSON.parse(mockPages[page - 1]) });
  });

  it('should scrape all books from a readlist', async () => {
    const books = await getBooksFromReadlist('https://zlibrary-africa.se/booklist/1295974/387287');

    expect(books).toHaveLength(75);
  });
});
