import SalitaApp from './salita-app';

import { localDateKey } from '@/lib/progress';

export default function Home() {
  return <SalitaApp initialTodayKey={localDateKey(new Date(), 'UTC')} />;
}
