import { data } from "../lib/data";
export function GET() {
  return new Response(JSON.stringify(data.search), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
