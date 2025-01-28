import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
@Injectable()
export class CrawlerService {
  async scrape(cutoffDate: Date) {
    cutoffDate = new Date(cutoffDate);
    const browser = await puppeteer.launch({});
    const page = await browser.newPage();
    await page.goto('https://freddiedeboer.substack.com/archive');
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
