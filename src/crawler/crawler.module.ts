import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { SupabaseService } from 'src/supabase/supabase.service';

@Module({
  providers: [CrawlerService,SupabaseService],
  controllers: [CrawlerController]
})
export class CrawlerModule {}
