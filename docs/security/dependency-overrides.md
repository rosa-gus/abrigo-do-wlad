# Security dependency overrides

The root `package.json` contains temporary overrides for vulnerable dependencies
that upstream packages still pin. They also apply to development tools: CI audits
the full dependency tree, including the Firestore emulator and Workers test pool.

| Override | Reason | Compatibility checks |
| --- | --- | --- |
| `@grpc/grpc-js` >= 1.14.5 | Firestore pins the affected 1.9 series; newer Google clients also need the certificate validation fix. | Firestore Rules emulator tests. |
| Workers test pool → root `zod` | The pool pins 4.4.3; the application and tooling need >= 4.6.6. | Unit tests and Workers runtime tests. |
| Miniflare → `sharp` >= 0.35.5, `undici` >= 7.30.1 | Bundled image libraries and HTTP client have security fixes. Keep Miniflare and workerd versions paired by their upstream packages. | Workers runtime tests and Worker packaging checks. |
| Pub/Sub → `@opentelemetry/core` >= 2.8.0 | The old core has unbounded baggage parsing. Pub/Sub uses `W3CTraceContextPropagator`, retained in core 2. | Firebase CLI loading and emulator tests. |
| Gaxios 6 → `uuid` >= 11.1.1 | Older UUID versions lack buffer bounds checks. UUID 11 preserves the CommonJS `v4` API used by Gaxios 6. | Firebase CLI loading and emulator tests. |

These are explicit compatibility exceptions, not permission to apply broad major
overrides. Remove each override when its upstream dependency declares a corrected
range, regenerate the lockfile, and rerun the checks above. Do not replace these
with the downgrades suggested by `npm audit fix --force`.

References:

- [gRPC certificate validation](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
- [Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [OpenTelemetry baggage parsing](https://github.com/advisories/GHSA-8988-4f7v-96qf)
- [UUID buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
