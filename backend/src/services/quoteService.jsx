import { promises as fs } from 'fs';
import path from 'path';

interface Quote {
  text: string;
  author: string;
}

class QuoteService {
  private quotes: Quote[] = [];
  private quotesLoaded = false;

  private async loadQuotes(): Promise<void> {
    try {
      // Assuming quotes.txt is in the root of the backend project
      const filePath = path.join(process.cwd(), 'quotes.txt');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      this.quotes = fileContent
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          const parts = line.split('---');
          if (parts.length !== 2) {
            console.warn(`Skipping malformed quote line: ${line}`);
            return null;
          }
          return {
            text: parts[0].trim(),
            author: parts[1].trim(),
          };
        })
        .filter((quote): quote is Quote => quote !== null);

      this.quotesLoaded = true;
      console.log('Successfully loaded and parsed quotes.');
    } catch (error) {
      console.error('Failed to load or parse quotes.txt:', error);
      // In a real app, you might want more robust error handling
      this.quotes = [];
    }
  }

  public async getQuotes(): Promise<Quote[]> {
    if (!this.quotesLoaded) {
      await this.loadQuotes();
    }
    return this.quotes;
  }
}

export const quoteService = new QuoteService();
