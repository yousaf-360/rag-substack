import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { SupabaseService } from '../supabase/supabase.service';
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
    // const supabase = await this.supabaseService.getClient();
    // const { data, error } = await supabase.from('substack').select('id,link');
    // for (const item of data){
    //   console.log('id : ' , item.id);
    //   console.log('link : ' , item.link);
    // }
    // return data;
    try {
      const page = await browser.newPage();
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

      await page.goto('https://freddiedeboer.substack.com/archive', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      await page.waitForSelector('.container-Qnseki');

      const results = new Set();
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
            await browser.close();
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
            '.available-content',
            (elements) => elements.map((el) => el.textContent.trim()),
          );

          const imageUrls = await articlePage.$$eval(
            '.available-content img',
            (imgs) => imgs.map((img) => img.src),
          );

          await articlePage.close();

          results.add({
            title,
            description,
            link,
            articleDate,
            pageText,
            imageUrls,
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

      await browser.close();
      return Array.from(results);
    } catch (error) {
      console.error('Scraping error:', error);
      throw error;
    }
  }
  // await page.locator('.container-Qnseki').click();

  // const results = await Promise.all(
  //     containers.map(async container =>{
  //         console.log(container);
  //         // await container.click();
  //         // await page.waitForSelector('.available-content');
  //         // const elements = await page.$$('.available-content');
  //         // const pageText = await Promise.all(
  //         //     elements.map(element => element.evaluate(el => el.textContent))
  //         // );
  //     })

  // );

  // await page.waitForSelector('.available-content');

  // const elements = await page.$$('.available-content');
  // const pageText = await Promise.all(
  //     elements.map(element => element.evaluate(el => el.textContent))
  // );

  // await page.waitForSelector('.available-content img');
  // const images = await page.$$('.available-content img');
  // const imageUrls = await Promise.all(
  //     images.map(img => img.evaluate(el => el.src))
  // );

  // console.log(pageText);
  // return results;

  //     // await page.locator('.homepage-nav-search-bar').fill('ai');
  //     await page.locator('.homepage-nav-search-bar').click();
  //     const searchInput = page.locator('input[name="search-dialog-input"]');
  //     await searchInput.fill('ai');
  //         // Click on the search suggestion containing the text 'ai'
  // await page.evaluate(() => {
  //     const elements = document.querySelectorAll('div.pencraft span.weight-bold-DmI9lw');
  //     for (const element of elements) {
  //       if (element.textContent?.trim() === 'ai') {
  //         (element as HTMLElement).click();
  //         break;
  //       }
  //     }
  //   });
  //   await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // const content = await page.content();
  // }
}
