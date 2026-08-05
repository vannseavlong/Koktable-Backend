import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port, () => {
  console.log(`🍽️ Restaurant API listening on http://localhost:${env.port}`);
  console.log(`   Auth:     http://localhost:${env.port}/user/auth/google`);
  console.log(`   Services: http://localhost:${env.port}/user/services`);
  console.log(`   Profile:  http://localhost:${env.port}/user/profile`);
  console.log(`   Reservations: http://localhost:${env.port}/user/reservations`);
  console.log(`   Admin:    http://localhost:${env.port}/admin`);
});
