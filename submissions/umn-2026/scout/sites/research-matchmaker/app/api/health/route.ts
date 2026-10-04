import { professors } from '@/server/catalog';

export async function GET() {
  return Response.json(
    { ok: true, liveAvailable: false, model: 'guided-demo', facultyCount: professors.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
