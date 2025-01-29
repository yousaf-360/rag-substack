import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { SupabaseService } from '../supabase/supabase.service';

interface ScrapedItem {
  articleDate: Date;
  link: string;
  title: string;
  description: string;
  pageText: string;
  is_processed: boolean;
  id: string;
}

@Injectable()
export class CrawlerService {
  constructor(private readonly supabaseService: SupabaseService){}
  async scrape(cutoffDate: Date) {
    cutoffDate = new Date(cutoffDate);
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      timeout: 60000 
    });


    try {
      const supabase = await this.supabaseService.getClient();
      const { data, error } = await supabase.from('substack').select('id,link');
      const results = new Set();

      for (const item of data){
        const temp = await this.scrapePage(browser,item.link,item.id,results,cutoffDate);
      }
      await browser.close();
      const resultsArray = Array.from(results);
      console.log('Results to save:', resultsArray);

      for (const item of resultsArray as ScrapedItem[]) {
        const { data, error } = await supabase.from('details').insert({
          dated_at: item.articleDate,
          link: item.link,
          title: item.title,
          description: item.description,
          content: item.pageText,
          is_processed: true,
          reference_id: item.id
        });

        if (error) {
          console.error('Supabase insert error:', error);
        } else {
          console.log('Saved item:', data);
        }
      }
      console.log('the end!')
      return resultsArray;

    } catch (error) {
      console.error('Scraping error:', error);
      throw error;
    }

  }

  private async scrapePage(browser, link,id,results, cutoffDate){
    const page = await browser.newPage();
    try{
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);
      
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
      await page.goto(link, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      await page.waitForSelector('.container-Qnseki');
  
      let lastHeight = await page.evaluate('document.body.scrollHeight');
  
      while (true) {
        const containers = await page.$$('.container-Qnseki');
  
        for (const container of containers) {
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
          const link = await container.$eval(
            'a[data-testid="post-preview-title"]',
            (el) => el.href,
          );
  
          const articlePage = await browser.newPage();
          await articlePage.goto(link);
          await articlePage.waitForSelector('.available-content');
  
          const pageText = await articlePage.$$eval(
            'div.available-content',
            (elements) => elements.map((el) => el.textContent.trim()),
          );
  
          const imageUrls = await articlePage.$$eval(
            '.available-content img',
            (imgs) => imgs.map((img) => img.src),
          );
  
          await articlePage.close();
          console.log('info : ',title,description,link,articleDate,pageText,imageUrls,id);
          results.add({
            title,
            description,
            link,
            articleDate,
            pageText,

            imageUrls,
            id
          });
        }
  
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise((resolve) => setTimeout(resolve, 2000));
  
        const newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === lastHeight) {
          break;
        }
        lastHeight = newHeight;
      }
    }
    catch(error){
      console.error('Scraping error:', error);
      throw error;
    }finally{
      await page.close();
    }
  }

}
