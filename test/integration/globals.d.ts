/// <reference path="../../node_modules/@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts" />

// Augment the global Response interface so tests can call res.json<T>() with
// a type parameter (the Web API Response.json() returns Promise<any> by default).
interface Response {
  json<T = unknown>(): Promise<T>;
}
