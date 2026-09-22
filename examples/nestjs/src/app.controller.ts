import { Controller, Get, Post, Body } from '@nestjs/common';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Controller('users')
export class AppController {
  @Get()
  getUsers() {
    return [{ id: 1, name: 'John Doe' }];
  }

  @Get(':id')
  async getUser() {
    await sleep(20);
    return { id: 1, name: 'John Doe' };
  }

  @Post()
  createUser(@Body() body: unknown) {
    return { success: true, body };
  }
}
