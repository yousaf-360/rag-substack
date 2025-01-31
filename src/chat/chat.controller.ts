import { Controller, Body, Sse, Post, Param, Get } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

type CustomMessageEvent = {
    data: { type: string; content?: any; fullMessage?: string; chatId?: string };
    type: string;
    lastEventId: string;
    origin: string;
  };

@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}
    @Post('/create')
    async createChat(@Body('chatName') chatName: string) {
      return this.chatService.createChat(chatName);
    }
  
    @Get()
    async getAllChats() {
      return this.chatService.getAllChats();
    }
  
    @Get(':chatId/messages')
    async getChatMessages(@Param('chatId') chatId: string) {
      return this.chatService.getChatMessages(chatId);
    }
    @Post('')
    @Sse()
    async chat(@Body() body: { message: string, chatId: string }) {
        let fullMessage = '';
        let isComplete = false;
        await this.chatService.saveMessage(body.chatId, body.message, 'user');
        const response = await this.chatService.chat(body.message);
        
        return from(response).pipe(
            map((data) => {
                if (data.choices[0].delta.content) {
                    fullMessage += data.choices[0].delta.content;
                    return { 
                        data: {
                            type: 'chunk',
                            content: data.choices[0].delta.content,
                        }
                    };
                }
                
                if (!isComplete && fullMessage) {
                    isComplete = true;
                    this.chatService.saveMessage(body.chatId, fullMessage, 'assistant')
                        .catch(error => console.error('Error saving message:', error));
                }
                
                return {
                    data: {
                        type: 'complete',
                        content: fullMessage,
                        fullMessage
                    }
                };
            })
        );
    }
}
