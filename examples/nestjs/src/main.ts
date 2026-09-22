import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProfilerInterceptor } from '@api-profiler/nestjs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const interceptor = new ProfilerInterceptor();
  app.useGlobalInterceptors(interceptor);
  
  await app.listen(3002);
  console.log('NestJS example app running on http://localhost:3002');
}
bootstrap();
