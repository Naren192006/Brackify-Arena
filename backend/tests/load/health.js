/**
 * Phase 0 placeholder — load tests run in Phase 8 gate.
 * Usage (requires k6): k6 run browse.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:8000";

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { "health status 200": (r) => r.status === 200 });
  sleep(0.5);
}
