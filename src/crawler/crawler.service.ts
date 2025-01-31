import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { SupabaseService } from '../supabase/supabase.service';
import { OpenAiService } from 'src/open-ai/open-ai.service';
import { ScrapedItem } from 'src/types/crawler.types';
import { Embedding } from 'src/types/openai.embeddings.types';
@Injectable()
export class CrawlerService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly openaiService: OpenAiService,
  ) {}
  async scrape(cutoffDate: Date) {
    cutoffDate = new Date(cutoffDate);
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
      timeout: 60000,
    });

    try {
      const supabase = await this.supabaseService.getClient();

      const { data: scrapedLinks, error: scrapedLinksError } = await supabase
        .from('details')
        .select('link')
        .eq('is_processed', true);

      if (scrapedLinksError) {
        console.error('Supabase fetch error:', scrapedLinksError);
        throw scrapedLinksError;
      }

      const scrapedLinksSet = new Set(scrapedLinks.map((item) => item.link));

      const { data, error } = await supabase.from('substack').select('id,link');

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      const results = new Set();

      await Promise.all(
        data.map(async (item) => {
          await this.scrapePage(
            browser,
            item.link,
            item.id,
            results,
            cutoffDate,
            scrapedLinksSet,
          );
        }),
      );

      await browser.close();

      const resultsArray = Array.from(results);
      console.log('Results to save:', resultsArray);

      const scrapedItems = resultsArray.map((item: ScrapedItem) => ({
        dated_at: item.articleDate,
        link: item.link,
        title: item.title,
        description: item.description,
        content: item.pageText,
        is_processed: true,
        reference_id: item.id,
      }));

      const embeddings = [];
      await Promise.all(
        scrapedItems.map(async (item) => {
          await this.openaiService.generateEmbeddingsForWebsites(
            item.link,
            item.content,
            embeddings,
          );
        }),
      );
      console.log(embeddings);

      const embeddingItems = embeddings.map((item: Embedding) => ({
        content: item.content,
        metadata: item.metadata,
        embeddings: item.embeddings,
      }));

      const { error: transactionError } = await supabase.rpc(
        'insert_scraped_and_embeddings',
        {
          scraped_items: scrapedItems,
          embedding_items: embeddingItems,
        },
      );

      if (transactionError) {
        console.error('Transaction failed:', transactionError);
        throw transactionError;
      } else {
        console.log('Transaction successful');
      }

      console.log('The end!');
      return resultsArray;
    } catch (error) {
      console.error('Scraping error:', error);
      throw error;
    }
  }

  private async scrapePage(
    browser,
    link,
    id,
    results,
    cutoffDate,
    scrapedLinksSet,
  ) {
    const page = await browser.newPage();
    try {
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (
          ['image', 'stylesheet', 'font', 'media'].includes(
            request.resourceType(),
          )
        ) {
          request.abort();
        } else {
          request.continue();
        }
      });

      let retries = 3;
      while (retries > 0) {
        try {
          console.log(`Attempting to load: ${link} (${retries} retries left)`);
          const response = await page.goto(link, {
            waitUntil: 'networkidle0',
            timeout: 60000,
          });

          if (!response || !response.ok()) {
            throw new Error(
              `Failed to load ${link}: ${response?.status()} ${response?.statusText()}`,
            );
          }
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      try {
        await page.waitForSelector('div.container-Qnseki', { timeout: 30000 });
      } catch (error) {
        console.warn(
          `Container selector not found for ${link}, continuing anyway`,
        );
      }

      let lastHeight = await page.evaluate('document.body.scrollHeight');

      while (true) {
        const containers = (await page.$$('div.container-Qnseki')) || [];

        if (containers.length === 0) {
          console.warn(`No containers found for ${link}`);
          return Array.from(results);
        }

        for (const container of containers) {
          const link = await container.$eval(
            'a[data-testid="post-preview-title"]',
            (el) => el.href,
          );
          if (!scrapedLinksSet.has(link)) {
            const dateElement = await container.$('time');

            const dateStr = await dateElement?.evaluate((el) =>
              el.getAttribute('datetime'),
            );
            const articleDate = dateStr ? new Date(dateStr) : null;

            if (articleDate && articleDate.getTime() < cutoffDate.getTime()) {
              // await browser.close();
              return Array.from(results);
            }

            const title = await container.$eval(
              'a[data-testid="post-preview-title"]',
              (el) => el.textContent.trim(),
            );
            const description = await container.$eval(
              'a.color-primary-zABazT',
              (el) => el.textContent.trim(),
            );

            const articlePage = await browser.newPage();
            await articlePage.goto(link);

            const selectors = [
              'div.available-content',
              '.available-content',
              'body',
            ];
            let pageText = '';
            for (const selector of selectors) {
              try {
                await articlePage.waitForSelector(selector, { timeout: 10000 });
                pageText = await articlePage.$$eval(selector, (elements) =>
                  elements.map((el) => el.textContent.trim()).join('\n'),
                );
                break;
              } catch (error) {
                console.warn(`Selector ${selector} failed, trying next...`);
              }
            }

            // const imageUrls = await articlePage.$$eval(
            //   '.available-content img',
            //   (imgs) => imgs.map((img) => img.src),
            // );

            await articlePage.close();
            console.log('info : ', link);
            results.add({
              title,
              description,
              link,
              articleDate,
              pageText,
              id,
            });
          }
        }

        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) {
          break;
        }
        lastHeight = newHeight;
      }
    } catch (error) {
      console.error(`Failed to scrape ${link}:`, error);
      return Array.from(results);
    } finally {
      await page
        .close()
        .catch((err) => console.error('Error closing page:', err));
    }
  }
}
