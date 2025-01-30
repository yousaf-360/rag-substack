import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { SupabaseService } from '../supabase/supabase.service';
import { OpenAiService } from 'src/open-ai/open-ai.service';
import { ScrapedItem } from 'src/types/crawler.types';
import { Embedding } from 'src/types/openai.embeddings.types';
@Injectable()
export class CrawlerService {
  constructor(private readonly supabaseService: SupabaseService,
    private readonly openaiService:OpenAiService
  ){}
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
  
      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }
  
      const results = new Set();
  
      await Promise.all(
        data.map(async (item) => {
          await this.scrapePage(browser, item.link, item.id, results, cutoffDate);
        })
      );
  
      await browser.close();
  
      const resultsArray = Array.from(results);
      console.log('Results to save:', resultsArray);
  
      await Promise.all(
        resultsArray.map(async (item: ScrapedItem) => {
          const { error } = await supabase.from('details').insert({
            dated_at: item.articleDate,
            link: item.link,
            title: item.title,
            description: item.description,
            content: item.pageText,
            is_processed: true,
            reference_id: item.id
          });
  
          if (error) {
            console.error(`Supabase insert error for ${item.link}:`, error);
          } else {
            console.log(`Saved item: ${item.link}`);
          }
        })
      );

      const {data:detailsData, error:detailsError} = await supabase.from('details').select('id,link,content').eq('is_processed',true);
      if(detailsError){
        console.error('Supabase fetch error:', detailsError);
        throw detailsError;
      }
      const embeddings = [];

      await Promise.all(detailsData.map(async (item) => {
        await this.openaiService.generateEmbeddingsForWebsites(item.link,item.content,embeddings);
      }));
      console.log(embeddings);
      await Promise.all(
        embeddings.map(async (item: Embedding) => {
          const { error } = await supabase.from('documents').insert({
            content:item.content,
            metadata:item.metadata,
            embedding:item.embeddings
          });
  
          if (error) {
            console.error(`Supabase insert error for ${item.content}:`, error);
          } else {
            console.log(`Saved item: ${item.content}`);
          }
        })
      );
  
      console.log('The end!');
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
      console.log('goto : ',link);
      await page.goto(link, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      await page.waitForSelector('div.container-Qnseki');
      let lastHeight = await page.evaluate('document.body.scrollHeight');
  
      while (true) {
        const containers = await page.$$('div.container-Qnseki');
  
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

          // Retry mechanism for waiting for selectors
          const selectors = ['div.available-content', '.available-content', 'body'];
          let pageText = '';
          for (const selector of selectors) {
            try {
              await articlePage.waitForSelector(selector, { timeout: 10000 });
              pageText = await articlePage.$$eval(
                selector,
                (elements) => elements.map((el) => el.textContent.trim()).join('\n')
              );
              break; // Exit loop if successful
            } catch (error) {
              console.warn(`Selector ${selector} failed, trying next...`);
            }
          }
  
          // const imageUrls = await articlePage.$$eval(
          //   '.available-content img',
          //   (imgs) => imgs.map((img) => img.src),
          // );
  
          await articlePage.close();
          console.log('info : ',link);
          results.add({
            title,
            description,
            link,
            articleDate,
            pageText,
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
