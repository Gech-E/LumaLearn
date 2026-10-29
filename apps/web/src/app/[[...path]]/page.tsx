import { Application } from '@/components/application';
import { connection } from 'next/server';
export default async function Page() {
  await connection();
  return <Application />;
}
