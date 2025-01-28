import { Controller, Get, Query } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
@Controller('crawler')
export class CrawlerController {
    constructor(private readonly crawlerService: CrawlerService) {}
    @Get('')
    async scrape(@Query('cutoffDate') cutoffDate: Date) {
        return this.crawlerService.scrape(cutoffDate);
    }
}