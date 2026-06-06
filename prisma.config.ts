import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DIRECT_URL é necessário só para migrations (prisma migrate deploy).
// Durante o build Docker, a variável não existe — o fallback evita erro no prisma generate.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? 'postgresql://localhost:5432/placeholder',
  },
});
